"""
services/social-service/main.py
Social Service - Reddit/Discord-style feed on the dashboard.
Posts, comments, likes, mini user cards (privacy-aware), and friend requests.
Runs on port 8012
"""

from datetime import datetime
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy.orm import Session

import sys

sys.path.append("/shared")

from shared_models import (
    Base,
    Friendship,
    FriendshipStatus,
    Group,
    GroupMembership,
    Post,
    PostComment,
    PostLike,
    User,
)
from shared_database import engine, get_db, run_light_migrations
from shared_auth import get_current_user
from shared_notifications import create_notification
from shared_schemas import (
    BlockedUserSummary,
    CommentCreate,
    CommentResponse,
    FriendRequestSummary,
    FriendSummary,
    PostCreate,
    PostResponse,
    PublicUserCard,
)


def init_db():
    Base.metadata.create_all(bind=engine)
    run_light_migrations(engine)


async def lifespan(app: FastAPI):
    print("💬 Social Service starting...")
    init_db()
    yield
    print("🛑 Social Service shutting down...")


app = FastAPI(
    title="StudySynq Social Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/social/health")
async def health():
    return {"status": "ok", "service": "social-service"}


# ── helpers ──────────────────────────────────────────────────────────────────

DEFAULT_PRIVACY = {"major": "public", "year_of_study": "public", "bio": "public", "email": "private"}


def _privacy(user: User) -> dict:
    merged = dict(DEFAULT_PRIVACY)
    merged.update(user.profile_privacy or {})
    return merged


def _author_group_name(db: Session, user_id) -> str | None:
    """The group a user 'is from' — their first (oldest) membership."""
    membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.user_id == user_id)
        .order_by(GroupMembership.created_at.asc())
        .first()
    )
    if not membership:
        return None
    group = db.query(Group).filter(Group.id == membership.group_id).first()
    return group.name if group and not group.is_deleted else None


def _post_to_response(db: Session, post: Post, current_user_id) -> PostResponse:
    author = db.query(User).filter(User.id == post.author_id).first()
    tagged_group = (
        db.query(Group).filter(Group.id == post.group_id).first()
        if post.group_id else None
    )
    like_count = db.query(PostLike).filter(PostLike.post_id == post.id).count()
    comment_count = (
        db.query(PostComment)
        .filter(PostComment.post_id == post.id, PostComment.is_deleted == False)  # noqa: E712
        .count()
    )
    liked = (
        db.query(PostLike)
        .filter(PostLike.post_id == post.id, PostLike.user_id == current_user_id)
        .first()
        is not None
    )
    return PostResponse(
        id=post.id,
        author_id=post.author_id,
        author_name=author.name if author else "Unknown",
        author_group=_author_group_name(db, post.author_id),
        group_id=post.group_id,
        group_name=tagged_group.name if tagged_group else None,
        content=post.content,
        created_at=post.created_at,
        like_count=like_count,
        comment_count=comment_count,
        liked_by_me=liked,
        is_mine=str(post.author_id) == str(current_user_id),
    )


# ── Feed ─────────────────────────────────────────────────────────────────────

@app.get("/social/feed", response_model=list[PostResponse])
async def get_feed(
    limit: int = Query(30, ge=1, le=100),
    before: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Newest-first feed of everyone's posts (campus-wide, like a subreddit)."""
    q = db.query(Post).filter(Post.is_deleted == False)  # noqa: E712

    # Blocking has to hide content, not just stop friend requests — otherwise
    # a blocked person's posts keep appearing in the feed. Applies in both
    # directions: neither party sees the other.
    blocked = _blocked_user_ids(db, current_user["user_id"])
    if blocked:
        q = q.filter(~Post.author_id.in_(blocked))

    if before:
        try:
            q = q.filter(Post.created_at < datetime.fromisoformat(before))
        except ValueError:
            pass
    posts = q.order_by(Post.created_at.desc()).limit(limit).all()
    return [_post_to_response(db, p, current_user["user_id"]) for p in posts]


@app.post("/social/posts", response_model=PostResponse, status_code=201)
async def create_post(
    body: PostCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if body.group_id:
        membership = (
            db.query(GroupMembership)
            .filter(
                GroupMembership.user_id == current_user["user_id"],
                GroupMembership.group_id == body.group_id,
            )
            .first()
        )
        if not membership:
            raise HTTPException(status_code=403, detail="You can only tag groups you belong to")

    post = Post(
        id=uuid4(),
        author_id=current_user["user_id"],
        group_id=body.group_id,
        content=body.content,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_response(db, post, current_user["user_id"])


@app.delete("/social/posts/{post_id}", status_code=204)
async def delete_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id, Post.is_deleted == False).first()  # noqa: E712
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.author_id) != str(current_user["user_id"]) and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    post.is_deleted = True
    post.deleted_at = datetime.utcnow()
    post.deleted_by = current_user["user_id"]
    db.commit()


@app.post("/social/posts/{post_id}/like")
async def toggle_like(
    post_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Toggle a like on a post. Returns the new state."""
    post = db.query(Post).filter(Post.id == post_id, Post.is_deleted == False).first()  # noqa: E712
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = (
        db.query(PostLike)
        .filter(PostLike.post_id == post_id, PostLike.user_id == current_user["user_id"])
        .first()
    )
    if existing:
        db.delete(existing)
        liked = False
    else:
        db.add(PostLike(id=uuid4(), post_id=post_id, user_id=current_user["user_id"]))
        liked = True
    db.commit()

    like_count = db.query(PostLike).filter(PostLike.post_id == post_id).count()
    return {"liked": liked, "like_count": like_count}


# ── Comments ─────────────────────────────────────────────────────────────────

@app.get("/social/posts/{post_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    post_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    comments = (
        db.query(PostComment)
        .filter(PostComment.post_id == post_id, PostComment.is_deleted == False)  # noqa: E712
        .order_by(PostComment.created_at.asc())
        .all()
    )
    out = []
    for c in comments:
        author = db.query(User).filter(User.id == c.author_id).first()
        out.append(CommentResponse(
            id=c.id,
            post_id=c.post_id,
            author_id=c.author_id,
            author_name=author.name if author else "Unknown",
            content=c.content,
            created_at=c.created_at,
        ))
    return out


@app.post("/social/posts/{post_id}/comments", response_model=CommentResponse, status_code=201)
async def create_comment(
    post_id: UUID,
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    post = db.query(Post).filter(Post.id == post_id, Post.is_deleted == False).first()  # noqa: E712
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = PostComment(
        id=uuid4(),
        post_id=post_id,
        author_id=current_user["user_id"],
        content=body.content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # Let the post author know (skip self-comments).
    if str(post.author_id) != str(current_user["user_id"]):
        author = db.query(User).filter(User.id == current_user["user_id"]).first()
        create_notification(
            db,
            user_id=post.author_id,
            type="social",
            title="New comment on your post",
            message=f"{author.name if author else 'Someone'} commented: {body.content[:80]}",
            link="/dashboard",
            meta={"post_id": str(post_id)},
        )

    me = db.query(User).filter(User.id == current_user["user_id"]).first()
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author_name=me.name if me else "Me",
        content=comment.content,
        created_at=comment.created_at,
    )


# ── User cards (clickable usernames) ─────────────────────────────────────────

def _friend_status(db: Session, me, other) -> str:
    row = (
        db.query(Friendship)
        .filter(
            ((Friendship.requester_id == me) & (Friendship.addressee_id == other))
            | ((Friendship.requester_id == other) & (Friendship.addressee_id == me))
        )
        .first()
    )
    if not row:
        return "none"
    if row.status == FriendshipStatus.BLOCKED.value:
        # The blocker sees that they blocked; the blocked user is told
        # nothing beyond "not connected", so a block isn't broadcast.
        return "blocked_by_me" if str(row.blocked_by) == str(me) else "none"
    if row.status == FriendshipStatus.ACCEPTED.value:
        return "friends"
    return "pending_out" if str(row.requester_id) == str(me) else "pending_in"


def _friendship_row(db: Session, me, other):
    """The friendship row between two users, in either direction."""
    return (
        db.query(Friendship)
        .filter(
            ((Friendship.requester_id == me) & (Friendship.addressee_id == other))
            | ((Friendship.requester_id == other) & (Friendship.addressee_id == me))
        )
        .first()
    )


def _blocked_user_ids(db: Session, me) -> set:
    """Every user in a block relationship with me, in either direction.

    Used to filter the feed: blocking should hide both directions, otherwise
    the block only stops requests and the person's posts keep showing up.
    """
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == FriendshipStatus.BLOCKED.value,
            (Friendship.requester_id == me) | (Friendship.addressee_id == me),
        )
        .all()
    )
    out = set()
    for r in rows:
        other = r.addressee_id if str(r.requester_id) == str(me) else r.requester_id
        out.add(other)
    return out


@app.get("/social/users/{user_id}/card", response_model=PublicUserCard)
async def get_user_card(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Little bit of user information for the clickable username popover.
    Only fields the user marked public are included."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    is_self = str(user_id) == str(current_user["user_id"])
    privacy = _privacy(user)

    def show(field, value):
        return value if (is_self or privacy.get(field, "public") == "public") else None

    group_names = []
    memberships = db.query(GroupMembership).filter(GroupMembership.user_id == user_id).all()
    for m in memberships:
        g = db.query(Group).filter(Group.id == m.group_id).first()
        if g and g.is_public and not g.is_deleted:
            group_names.append(g.name)

    return PublicUserCard(
        id=user.id,
        name=user.name,
        major=show("major", user.major),
        year_of_study=show("year_of_study", user.year_of_study),
        bio=show("bio", user.bio),
        email=show("email", user.email),
        groups=group_names[:5],
        friend_status="self" if is_self else _friend_status(db, current_user["user_id"], user_id),
    )


# ── Friends ──────────────────────────────────────────────────────────────────

@app.post("/social/friends/{user_id}", status_code=201)
async def send_friend_request(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    me = current_user["user_id"]
    if str(user_id) == str(me):
        raise HTTPException(status_code=400, detail="You can't add yourself")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = _friendship_row(db, me, user_id)
    if existing and existing.status == FriendshipStatus.BLOCKED.value:
        # Don't reveal that the *other* party blocked us — same message either way.
        raise HTTPException(status_code=403, detail="You can't send a request to this user")

    status = _friend_status(db, me, user_id)
    if status == "friends":
        raise HTTPException(status_code=400, detail="You're already friends")
    if status == "pending_out":
        raise HTTPException(status_code=400, detail="Friend request already sent")
    if status == "pending_in":
        # They already asked us — accept instead.
        return await accept_friend_request(user_id, db, current_user)

    db.add(Friendship(
        id=uuid4(),
        requester_id=me,
        addressee_id=user_id,
        status=FriendshipStatus.PENDING.value,
    ))
    db.commit()

    sender = db.query(User).filter(User.id == me).first()
    create_notification(
        db,
        user_id=user_id,
        type="social",
        title="New friend request",
        message=f"{sender.name if sender else 'Someone'} sent you a friend request.",
        link="/dashboard",
        meta={"friend_request_from": str(me)},
    )
    return {"status": "pending_out"}


@app.post("/social/friends/{user_id}/accept")
async def accept_friend_request(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Accept a pending request that `user_id` sent to me."""
    me = current_user["user_id"]
    row = (
        db.query(Friendship)
        .filter(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == me,
            Friendship.status == FriendshipStatus.PENDING.value,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No pending request from this user")

    row.status = FriendshipStatus.ACCEPTED.value
    row.accepted_at = datetime.utcnow()
    db.commit()

    accepter = db.query(User).filter(User.id == me).first()
    create_notification(
        db,
        user_id=user_id,
        type="social",
        title="Friend request accepted",
        message=f"{accepter.name if accepter else 'Someone'} accepted your friend request.",
        link="/dashboard",
    )
    return {"status": "friends"}


@app.get("/social/friends", response_model=list[FriendSummary])
async def list_friends(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    me = current_user["user_id"]
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == FriendshipStatus.ACCEPTED.value,
            (Friendship.requester_id == me) | (Friendship.addressee_id == me),
        )
        .order_by(Friendship.accepted_at.desc().nullslast())
        .all()
    )
    out = []
    for row in rows:
        other_id = row.addressee_id if str(row.requester_id) == str(me) else row.requester_id
        other = db.query(User).filter(User.id == other_id).first()
        if other:
            privacy = dict(DEFAULT_PRIVACY)
            privacy.update(other.profile_privacy or {})
            out.append(FriendSummary(
                id=other.id,
                name=other.name,
                major=other.major if privacy.get("major") == "public" else None,
                friends_since=row.accepted_at or row.created_at,
            ))
    return out


@app.get("/social/friends/requests", response_model=list[FriendRequestSummary])
async def list_friend_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Incoming requests awaiting my decision.

    Previously a request could only be accepted from the notification that
    announced it, so a dismissed notification stranded the request with no
    way to find it again.
    """
    me = current_user["user_id"]
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == FriendshipStatus.PENDING.value,
            Friendship.addressee_id == me,
        )
        .order_by(Friendship.created_at.desc())
        .all()
    )
    out = []
    for row in rows:
        other = db.query(User).filter(User.id == row.requester_id).first()
        if other:
            privacy = dict(DEFAULT_PRIVACY)
            privacy.update(other.profile_privacy or {})
            out.append(FriendRequestSummary(
                id=other.id,
                name=other.name,
                major=other.major if privacy.get("major") == "public" else None,
                requested_at=row.created_at,
            ))
    return out


@app.delete("/social/friends/{user_id}", status_code=200)
async def remove_friend(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Unfriend, withdraw a sent request, or decline a received one.

    All three are the same operation on the underlying row, so one endpoint
    covers them. Deliberately silent — the other party isn't notified that
    they were removed.
    """
    me = current_user["user_id"]
    row = _friendship_row(db, me, user_id)
    if not row or row.status == FriendshipStatus.BLOCKED.value:
        raise HTTPException(status_code=404, detail="No connection with this user")

    db.delete(row)
    db.commit()
    return {"status": "none"}


@app.post("/social/friends/{user_id}/block", status_code=200)
async def block_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Block a user: removes any friendship and hides both parties from
    each other's feed. Works whether or not a prior relationship existed."""
    me = current_user["user_id"]
    if str(user_id) == str(me):
        raise HTTPException(status_code=400, detail="You can't block yourself")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.utcnow()
    row = _friendship_row(db, me, user_id)
    if row:
        if row.status == FriendshipStatus.BLOCKED.value:
            if str(row.blocked_by) == str(me):
                return {"status": "blocked_by_me"}
            raise HTTPException(status_code=403, detail="You can't block this user")
        row.status = FriendshipStatus.BLOCKED.value
        row.blocked_by = me
        row.blocked_at = now
        row.accepted_at = None
    else:
        db.add(Friendship(
            id=uuid4(),
            requester_id=me,
            addressee_id=user_id,
            status=FriendshipStatus.BLOCKED.value,
            blocked_by=me,
            blocked_at=now,
        ))

    db.commit()
    return {"status": "blocked_by_me"}


@app.delete("/social/friends/{user_id}/block", status_code=200)
async def unblock_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lift a block I placed. Does not restore the previous friendship."""
    me = current_user["user_id"]
    row = _friendship_row(db, me, user_id)
    if not row or row.status != FriendshipStatus.BLOCKED.value:
        raise HTTPException(status_code=404, detail="This user isn't blocked")
    if str(row.blocked_by) != str(me):
        raise HTTPException(status_code=403, detail="You didn't block this user")

    db.delete(row)
    db.commit()
    return {"status": "none"}


@app.get("/social/friends/blocked", response_model=list[BlockedUserSummary])
async def list_blocked_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Users I have blocked, so the block can be reviewed and undone."""
    me = current_user["user_id"]
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == FriendshipStatus.BLOCKED.value,
            Friendship.blocked_by == me,
        )
        .order_by(Friendship.blocked_at.desc().nullslast())
        .all()
    )
    out = []
    for row in rows:
        other_id = row.addressee_id if str(row.requester_id) == str(me) else row.requester_id
        other = db.query(User).filter(User.id == other_id).first()
        if other:
            out.append(BlockedUserSummary(
                id=other.id, name=other.name, blocked_at=row.blocked_at,
            ))
    return out


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8012)