"""
services/announcements-service/main.py
Announcement Board service (US-E.2 @author: Ahmed).
Runs on port 8010.

Each study group has its own announcement feed. Group leaders (and admins) can
create / edit / pin / delete announcements; all members can read them. Creating an
announcement fans out an "announcement" notification to every other group member
through shared_notifications.create_group_notifications.
"""
from uuid import uuid4, UUID
from datetime import datetime
import os

import httpx
from fastapi import FastAPI, HTTPException, status, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import sys
sys.path.append("/shared")
from shared_models import Announcement, Group, GroupMembership, GroupMembershipRole, User, Base
from shared_database import engine, get_db
from shared_auth import get_current_user
from shared_schemas import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from shared_notifications import create_group_notifications


def init_db():
    Base.metadata.create_all(bind=engine)


async def lifespan(app: FastAPI):
    print("📣 Announcements Service starting...")
    init_db()
    yield
    print("🛑 Announcements Service shutting down...")


app = FastAPI(title="StudySync Announcements Service", version="1.0.0", lifespan=lifespan)


class AnnouncementAIDraftRequest(BaseModel):
    title: str = ""
    rough_draft: str = Field(..., min_length=5, max_length=4000)
    tone: str = "clear, friendly, and professional"


class AnnouncementAIDraftResponse(BaseModel):
    title: str
    draft: str


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _membership(db: Session, group_id, user_id):
    return (db.query(GroupMembership)
              .filter(GroupMembership.group_id == group_id,
                      GroupMembership.user_id == user_id)
              .first())


def _require_member(db: Session, group_id, current_user):
    """Members and admins may read a group's announcements."""
    if current_user.get("role") == "admin":
        return
    if not _membership(db, group_id, current_user["user_id"]):
        raise HTTPException(status_code=403, detail="Not a member of this group")


def _require_leader(db: Session, group_id, current_user):
    """Only the group's leader (or an admin) may create / edit / delete."""
    if current_user.get("role") == "admin":
        return
    membership = _membership(db, group_id, current_user["user_id"])
    if not (membership and membership.role == GroupMembershipRole.LEADER):
        raise HTTPException(status_code=403, detail="Only group leaders can manage announcements")


def _to_response(db: Session, a: Announcement) -> AnnouncementResponse:
    """Map an Announcement to its response schema, resolving the author's name."""
    author = db.query(User).filter(User.id == a.author_id).first()
    return AnnouncementResponse(
        id=a.id,
        group_id=a.group_id,
        author_id=a.author_id,
        author_name=author.name if author else "Unknown",
        title=a.title,
        message=a.message,
        is_pinned=a.is_pinned,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------

@app.get("/announcements/health")
async def health():
    return {"status": "ok", "service": "announcements-service"}



@app.post("/groups/{group_id}/announcements/ai-draft", response_model=AnnouncementAIDraftResponse)
async def generate_announcement_ai_draft(
    group_id: UUID,
    data: AnnouncementAIDraftRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    US-G.4 - Announcement Drafting Assistant.
    Group leaders/admins can improve a rough announcement draft with AI before posting it.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    _require_leader(db, group_id, current_user)

    rough_draft = data.rough_draft.strip()
    title = data.title.strip()

    if not rough_draft:
        raise HTTPException(status_code=400, detail="Announcement draft cannot be empty")

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Groq API key not configured")

    prompt = f"""
Rewrite the following rough study group announcement into a clear, helpful, well-formatted announcement.

Requirements:
- Keep the original meaning.
- Do not invent new dates, times, links, or promises.
- Use a {data.tone} tone.
- Keep it concise.
- If the draft is already polished, rewrite it as a fresh alternative version with different wording.
- Make it ready for students to read.
- Do not repeat the announcement title inside the body.
- Return plain text only.
- Do not use Markdown formatting.
- Do not use asterisks, bold formatting, or headings wrapped in symbols.
- Do not add placeholders like [Your Name].
- Do not add a signature unless the original draft already included one.

Announcement title: {title or "Untitled announcement"}

Rough draft:
{rough_draft}
""".strip()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                    "messages": [
                        {
                            "role": "system",
                            "content": "You help group leaders write clear, student-friendly announcements. Return plain text only, with no Markdown formatting, no asterisks, and no placeholders.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 500,
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as e:
        print(f"[announcements-service] Groq returned an error: {e}")
        raise HTTPException(status_code=502, detail="AI drafting service returned an error")
    except httpx.RequestError as e:
        print(f"[announcements-service] failed to reach Groq: {e}")
        raise HTTPException(status_code=502, detail="AI drafting service is unavailable")

    try:
        draft = response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[announcements-service] invalid Groq response: {e}")
        raise HTTPException(status_code=502, detail="AI drafting service returned an invalid response")

    return AnnouncementAIDraftResponse(
        title=title or "Announcement",
        draft=draft,
    )


@app.get("/groups/{group_id}/announcements", response_model=list[AnnouncementResponse])
async def list_announcements(group_id: UUID, db: Session = Depends(get_db),
                             current_user: dict = Depends(get_current_user)):
    """List a group's announcements (pinned first, then newest)."""
    _require_member(db, group_id, current_user)
    rows = (db.query(Announcement)
              .filter(Announcement.group_id == group_id,
                      Announcement.is_deleted == False)  # noqa: E712 — hide moderated (US-F.2)
              .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
              .all())
    return [_to_response(db, a) for a in rows]


@app.post("/groups/{group_id}/announcements", response_model=AnnouncementResponse, status_code=201)
async def create_announcement(group_id: UUID, data: AnnouncementCreate,
                              db: Session = Depends(get_db),
                              current_user: dict = Depends(get_current_user)):
    """Post an announcement (group leader or admin only)."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_leader(db, group_id, current_user)

    announcement = Announcement(
        id=uuid4(),
        group_id=group_id,
        author_id=current_user["user_id"],
        title=data.title,
        message=data.message,
        is_pinned=data.is_pinned,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)

    # US-E.2 → US-E.1: notify every other member that a new announcement was posted.
    try:
        preview = data.message if len(data.message) <= 140 else data.message[:137] + "..."
        create_group_notifications(
            db,
            group_id=group_id,
            type="announcement",
            title=f"New announcement: {data.title}",
            message=preview,
            link=f"/groups/{group_id}?tab=announcements",
            exclude_user_id=current_user["user_id"],
            meta={"announcement_id": str(announcement.id), "group_id": str(group_id)},
        )
    except Exception as e:  # pragma: no cover - notifications are best-effort
        print(f"[announcements-service] failed to create announcement notifications: {e}")

    return _to_response(db, announcement)


@app.get("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def get_announcement(announcement_id: UUID, db: Session = Depends(get_db),
                           current_user: dict = Depends(get_current_user)):
    """Get a single announcement (any member of its group, or admin)."""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement or announcement.is_deleted:  # moderated announcements are inaccessible (US-F.2)
        raise HTTPException(status_code=404, detail="Announcement not found")
    _require_member(db, announcement.group_id, current_user)
    return _to_response(db, announcement)


@app.patch("/announcements/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(announcement_id: UUID, data: AnnouncementUpdate,
                              db: Session = Depends(get_db),
                              current_user: dict = Depends(get_current_user)):
    """Edit / pin / unpin an announcement (group leader or admin only)."""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    _require_leader(db, announcement.group_id, current_user)

    for field, value in data.dict(exclude_unset=True).items():
        setattr(announcement, field, value)
    announcement.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(announcement)
    return _to_response(db, announcement)


@app.delete("/announcements/{announcement_id}", status_code=204)
async def delete_announcement(announcement_id: UUID, db: Session = Depends(get_db),
                              current_user: dict = Depends(get_current_user)):
    """Delete an announcement (group leader or admin only)."""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    _require_leader(db, announcement.group_id, current_user)

    db.delete(announcement)
    db.commit()
    return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
