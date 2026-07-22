"""
services/groups-service/main.py
Groups Service
- List public groups
- Create new group
- Get group details
- Update group
- Delete group
- Join/leave group
- List group members

Runs on port 8003
"""

from datetime import datetime
from uuid import uuid4, UUID
from fastapi import FastAPI, HTTPException, status, Depends, Body
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager

# Import shared utilities
import sys
sys.path.append("/shared")
from shared_models import (
    Group, GroupMembership, GroupMembershipRole, GroupCourse, Course,
    User, UserEnrollment, Recommendation, StudySession, ModerationLog, Base
)
from shared_database import SessionLocal, engine, get_db
from shared_auth import get_current_user
from shared_schemas import (
    GroupCreate, GroupResponse, GroupDetailResponse, GroupUpdate,
    GroupMemberResponse, GroupOwnershipTransfer, CourseResponse
)

# ============================================================================
# Initialize Database
# ============================================================================

def init_db():
    """Create tables if they don't exist."""
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    print("👥 Groups Service starting...")
    init_db()
    yield
    print("🛑 Groups Service shutting down...")

app = FastAPI(
    title="StudySynq Groups Service",
    description="Study group management",
    version="1.0.0",
    lifespan=lifespan
)


# ============================================================================
# Helper functions for US-B.4
# ============================================================================

def _get_group_or_404(db: Session, group_id: UUID):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or group.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    return group


def _invalidate_recommendations(db: Session, user_ids) -> None:
    """Drop cached ML recommendation rows for the given users.

    Membership changes alter which groups are candidates, so precomputed
    scores go stale immediately. Deleting them makes the recommendations
    endpoint fall back to live course-overlap scoring until the next ETL
    run rewrites the table. Caller commits.
    """
    ids = [uid for uid in (user_ids or []) if uid]
    if not ids:
        return
    db.query(Recommendation).filter(
        Recommendation.user_id.in_(ids)
    ).delete(synchronize_session=False)


def _get_membership(db: Session, group_id: UUID, user_id):
    return db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.user_id == user_id
    ).first()


def _require_group_manager(db: Session, group_id: UUID, current_user):
    group = _get_group_or_404(db, group_id)
    if current_user["role"] == "admin":
        return group

    if str(group.created_by) == str(current_user["user_id"]):
        return group

    membership = _get_membership(db, group_id, current_user["user_id"])
    if not (membership and membership.role == GroupMembershipRole.LEADER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group leaders can manage members"
        )
    return group


def _require_group_owner(db: Session, group_id: UUID, current_user):
    group = _get_group_or_404(db, group_id)
    if current_user["role"] != "admin" and str(group.created_by) != str(current_user["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the group owner can perform this action"
        )
    return group


def _leader_count(db: Session, group_id: UUID) -> int:
    return db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.role == GroupMembershipRole.LEADER
    ).count()


# ============================================================================
# Routes
# ============================================================================

@app.get("/groups/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "groups-service"}

@app.get("/groups", response_model=List[GroupResponse])
async def list_groups(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all public groups.
    Only authenticated users can list groups.
    """
    groups = db.query(Group).filter(Group.is_public == True,
                                    Group.is_deleted == False).all()  # noqa: E712 — hide moderated (US-F.2)
    
    return [
        GroupResponse(
            id=g.id,
            name=g.name,
            description=g.description,
            is_public=g.is_public,
            session=g.session,
            section=g.section,
            intended_major=g.intended_major,
            created_by=g.created_by,
            created_at=g.created_at
        )
        for g in groups
    ]

@app.post("/groups", response_model=GroupResponse)
async def create_group(
    group_data: GroupCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a new study group.
    Authenticated users can create groups.
    Creator automatically becomes group leader.
    """
    new_group = Group(
        id=uuid4(),
        name=group_data.name,
        description=group_data.description,
        created_by=current_user["user_id"],
        is_public=group_data.is_public,
        intended_major=group_data.intended_major,
        session=group_data.session,
        section=group_data.section,
    )
    
    db.add(new_group)
    db.flush()  # Get the group ID
    
    # Add creator as group leader
    membership = GroupMembership(
        user_id=current_user["user_id"],
        group_id=new_group.id,
        role=GroupMembershipRole.LEADER
    )
    db.add(membership)
    
    # Add courses to group
    for course_id in group_data.course_ids or []:
        course = db.query(Course).filter(Course.id == course_id).first()
        if course:
            group_course = GroupCourse(
                group_id=new_group.id,
                course_id=course_id
            )
            db.add(group_course)

    # A new course-linked group changes the candidate set for enrolled
    # students. Clear their cached scores so the recommendations endpoint
    # immediately uses current course overlap until the next ETL refresh.
    if group_data.course_ids:
        affected_user_ids = [row[0] for row in (
            db.query(UserEnrollment.user_id)
            .filter(UserEnrollment.course_id.in_(group_data.course_ids))
            .distinct()
            .all()
        )]
        _invalidate_recommendations(db, affected_user_ids)
    
    db.commit()
    db.refresh(new_group)
    
    return GroupResponse(
        id=new_group.id,
        name=new_group.name,
        description=new_group.description,
        is_public=new_group.is_public,
        session=new_group.session,
        section=new_group.section,
        intended_major=new_group.intended_major,
        created_by=new_group.created_by,
        created_at=new_group.created_at
    )

@app.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get detailed information about a group.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group or group.is_deleted:  # moderated groups are inaccessible (US-F.2)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Count members
    member_count = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id
    ).count()
    
    # Get course codes
    group_courses = db.query(GroupCourse).filter(
        GroupCourse.group_id == group_id
    ).all()
    course_codes = []
    courses = []
    for gc in group_courses:
        course = db.query(Course).filter(Course.id == gc.course_id).first()
        if course:
            course_codes.append(course.course_code)
            courses.append(CourseResponse(
                id=course.id,
                course_code=course.course_code,
                course_name=course.course_name,
                department=course.department
            ))
    
    return GroupDetailResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_public=group.is_public,
        session=group.session,
        section=group.section,
        intended_major=group.intended_major,
        created_by=group.created_by,
        created_at=group.created_at,
        member_count=member_count,
        course_codes=course_codes,
        courses=courses
    )

@app.put("/groups/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: UUID,
    group_data: GroupUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update group information.
    Only group leader or admin can update.
    """
    group = _require_group_manager(db, group_id, current_user)
    
    # Update fields
    if group_data.name is not None:
        normalized_name = group_data.name.strip()
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Group name cannot be empty")
        group.name = normalized_name
    if group_data.description is not None:
        group.description = group_data.description
    if group_data.is_public is not None:
        group.is_public = group_data.is_public
    if group_data.intended_major is not None:
        group.intended_major = group_data.intended_major
    if group_data.session is not None:
        group.session = group_data.session or None
    if group_data.section is not None:
        group.section = group_data.section or None

    if group_data.course_ids is not None:
        course_ids = list(dict.fromkeys(group_data.course_ids))
        if not course_ids:
            raise HTTPException(status_code=400, detail="Select at least one linked course")

        valid_courses = db.query(Course).filter(Course.id.in_(course_ids)).all()
        if len(valid_courses) != len(course_ids):
            raise HTTPException(status_code=400, detail="One or more selected courses do not exist")

        previous_course_ids = [row.course_id for row in db.query(GroupCourse).filter(
            GroupCourse.group_id == group_id
        ).all()]
        db.query(GroupCourse).filter(GroupCourse.group_id == group_id).delete(
            synchronize_session=False
        )
        for course_id in course_ids:
            db.add(GroupCourse(group_id=group_id, course_id=course_id))

        affected_course_ids = list(set(previous_course_ids + course_ids))
        affected_user_ids = [row[0] for row in (
            db.query(UserEnrollment.user_id)
            .filter(UserEnrollment.course_id.in_(affected_course_ids))
            .distinct()
            .all()
        )]
        _invalidate_recommendations(db, affected_user_ids)
    
    db.commit()
    db.refresh(group)
    
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_public=group.is_public,
        session=group.session,
        section=group.section,
        intended_major=group.intended_major,
        created_by=group.created_by,
        created_at=group.created_at
    )

@app.delete("/groups/{group_id}")
async def delete_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Delete a group.
    Only group leader or admin can delete.
    """
    group = _require_group_owner(db, group_id, current_user)

    # Keep historical records with group foreign keys intact while removing the
    # group from every active StudySync view.
    now = datetime.utcnow()
    group.is_deleted = True
    group.deleted_at = now
    group.deleted_by = current_user["user_id"]

    # Cascade the soft-delete to the group's sessions. Without this the
    # sessions stay live: they keep appearing in "upcoming" feeds and
    # recommendation cards for a group nobody can open.
    db.query(StudySession).filter(
        StudySession.group_id == group_id,
        StudySession.is_deleted == False,       # noqa: E712
    ).update(
        {
            StudySession.is_deleted: True,
            StudySession.deleted_at: now,
            StudySession.deleted_by: current_user["user_id"],
        },
        synchronize_session=False,
    )

    db.query(Recommendation).filter(Recommendation.group_id == group_id).delete(
        synchronize_session=False
    )

    # Record it in the same audit trail admins use, so a leader deleting
    # their own group is visible in the moderation console and can be
    # restored from there.
    is_admin = str(current_user.get("role", "")).lower().endswith("admin")
    db.add(ModerationLog(
        id=uuid4(),
        admin_id=current_user["user_id"],
        entity_type="group",
        entity_id=str(group_id),
        action="delete",
        reason=None,
        target_title=group.name,
        actor_role="admin" if is_admin else "leader",
        created_at=now,
    ))

    db.commit()
    
    return {"status": "deleted"}

@app.post("/groups/{group_id}/join")
async def join_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Join a public group as a member.

    Uses _get_group_or_404 rather than a bare id lookup so that groups an
    admin has moderated (is_deleted) are unjoinable — previously this
    endpoint was the one place that skipped that check, which meant a
    soft-deleted group could still be joined by anyone holding its id.
    """
    group = _get_group_or_404(db, group_id)

    # Private groups are not open-join. They're only reachable by id, so
    # without this check "private" meant nothing more than "unlisted".
    if not group.is_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This group is private. Ask a group leader for an invite."
        )

    # Check if already member
    existing = db.query(GroupMembership).filter(
        GroupMembership.user_id == current_user["user_id"],
        GroupMembership.group_id == group_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already a member of this group"
        )
    
    # Add as member
    membership = GroupMembership(
        user_id=current_user["user_id"],
        group_id=group_id,
        role=GroupMembershipRole.MEMBER
    )
    db.add(membership)

    # Joining changes this user's candidate set, so any cached ML scores for
    # them are now stale. Clearing them makes the recommendations endpoint
    # fall back to live overlap until the next ETL run.
    _invalidate_recommendations(db, [current_user["user_id"]])

    db.commit()
    
    return {"status": "joined"}

@app.delete("/groups/{group_id}/leave")
async def leave_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Leave a group.
    """
    group = _get_group_or_404(db, group_id)
    if str(group.created_by) == str(current_user["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfer ownership before leaving this group"
        )

    membership = db.query(GroupMembership).filter(
        GroupMembership.user_id == current_user["user_id"],
        GroupMembership.group_id == group_id
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not a member of this group"
        )
    
    db.delete(membership)

    # Leaving puts this group back in play for the user, so cached scores
    # (which were computed while they were a member) are stale.
    _invalidate_recommendations(db, [current_user["user_id"]])

    db.commit()
    
    return {"status": "left"}


@app.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    US-B.4 - Group Leader Management Console.
    Group leaders/admins can remove members, but they cannot remove themselves.
    """
    group = _require_group_manager(db, group_id, current_user)

    if str(user_id) == str(current_user["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Leaders cannot remove themselves from the management console"
        )

    if str(user_id) == str(group.created_by):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The group owner cannot be removed"
        )

    membership = _get_membership(db, group_id, user_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this group"
        )

    if membership.role == GroupMembershipRole.LEADER and _leader_count(db, group_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the only group leader"
        )

    db.delete(membership)
    db.commit()

    return {"status": "removed", "group_id": group_id, "user_id": user_id}


@app.patch("/groups/{group_id}/members/{user_id}/role", response_model=GroupMemberResponse)
async def update_group_member_role(
    group_id: UUID,
    user_id: UUID,
    membership_role: str = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    US-B.4 - Promote or demote a member between member and leader.
    """
    group = _require_group_manager(db, group_id, current_user)

    if str(user_id) == str(current_user["user_id"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Leaders cannot change their own role"
        )

    if str(user_id) == str(group.created_by):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The group owner's role cannot be changed"
        )

    membership = _get_membership(db, group_id, user_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this group"
        )

    normalized_role = membership_role.strip().lower()
    if normalized_role not in {"member", "leader"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="membership_role must be either 'member' or 'leader'"
        )

    if (
        membership.role == GroupMembershipRole.LEADER
        and normalized_role == "member"
        and _leader_count(db, group_id) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote the only group leader"
        )

    membership.role = GroupMembershipRole.LEADER if normalized_role == "leader" else GroupMembershipRole.MEMBER
    db.commit()
    db.refresh(membership)

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return GroupMemberResponse(
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        membership_role=membership.role.value
    )


@app.post("/groups/{group_id}/transfer-ownership")
async def transfer_group_ownership(
    group_id: UUID,
    transfer: GroupOwnershipTransfer,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Transfer ownership to an existing member; the previous owner remains a leader."""
    group = _require_group_owner(db, group_id, current_user)

    if str(transfer.new_owner_id) == str(group.created_by):
        raise HTTPException(status_code=400, detail="This member already owns the group")

    new_owner_membership = _get_membership(db, group_id, transfer.new_owner_id)
    if not new_owner_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ownership can only be transferred to an existing group member"
        )

    new_owner_membership.role = GroupMembershipRole.LEADER
    group.created_by = transfer.new_owner_id
    db.commit()

    return {
        "status": "transferred",
        "group_id": group_id,
        "new_owner_id": transfer.new_owner_id
    }


@app.get("/groups/{group_id}/members", response_model=List[GroupMemberResponse])
async def list_group_members(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all members of a group.
    """
    _get_group_or_404(db, group_id)
    
    memberships = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id
    ).all()
    
    members = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            members.append(GroupMemberResponse(
                user_id=user.id,
                user_name=user.name,
                user_email=user.email,
                membership_role=m.role.value
            ))
    
    return members

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
