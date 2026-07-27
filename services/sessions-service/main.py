"""
services/sessions-service/main.py
Sessions Service - schedule and manage study sessions.
Runs on port 8004
"""
from uuid import uuid4
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session

import sys
import os
import httpx
sys.path.append("/shared")
from shared_models import StudySession, Group, GroupMembership, GroupMembershipRole, User, Base
from shared_database import engine, get_db
from shared_auth import get_current_user
from shared_schemas import StudySessionCreate, StudySessionUpdate, StudySessionResponse, StudySessionDetailResponse, SessionRSVPCreate, SessionRSVPResponse
from shared_models import SessionRSVP, SessionRSVPStatus
from shared_notifications import create_group_notifications, create_notification  # US-E.1

def init_db():
    Base.metadata.create_all(bind=engine)

def _has_occurred(scheduled_at: datetime) -> bool:
    """True once a session's scheduled time is in the past (tz-safe)."""
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    return scheduled_at <= datetime.now(timezone.utc)

def _live_sessions(db: Session):
    """Base query excluding admin-moderated (soft-deleted) sessions.

    is_deleted is moderation; is_cancelled is a leader cancelling a session
    that members should still see struck through. Only the former hides a
    session entirely.
    """
    return db.query(StudySession).filter(StudySession.is_deleted == False)  # noqa: E712

def _get_live_session_or_404(db: Session, session_id: str) -> StudySession:
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

def _can_manage_session(db: Session, session: StudySession, current_user: dict) -> bool:
    """Creator, group leaders, and admins can edit/cancel/delete a session —
    not just whoever happened to create it, matching how the rest of the app
    treats group leaders as full managers of their group's content."""
    if str(session.created_by) == str(current_user["user_id"]):
        return True
    if current_user.get("role") == "admin":
        return True
    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == session.group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    return bool(membership and membership.role == GroupMembershipRole.LEADER)

async def lifespan(app: FastAPI):
    print("Sessions Service starting...")
    init_db()
    yield
    print("Sessions Service shutting down...")

app = FastAPI(title="StudySynq Sessions Service", version="1.0.0", lifespan=lifespan)

@app.get("/sessions/health")
async def health():
    return {"status": "ok", "service": "sessions-service"}

@app.get("/groups/{group_id}/sessions", response_model=list[StudySessionResponse])
async def list_sessions(group_id: str, db: Session = Depends(get_db),
                        current_user: dict = Depends(get_current_user)):
    """List all sessions for a group."""
    return (_live_sessions(db)
              .filter(StudySession.group_id == group_id)
              .order_by(StudySession.scheduled_at).all())

# US-C.1 @author: Uzma Alam
@app.post("/groups/{group_id}/sessions", response_model=StudySessionResponse, status_code=201)
async def create_session(group_id: str, data: StudySessionCreate,
                         db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Schedule a session (group leader only)."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    is_leader = membership and membership.role == GroupMembershipRole.LEADER
    if not is_leader and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only group leaders can schedule sessions")

    # Validate scheduled_at is in the future
    scheduled = data.scheduled_at
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    if scheduled <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="scheduled_at must be a future date and time")

    # Check for scheduling conflict within the same group
    conflict = (_live_sessions(db)
                  .filter(StudySession.group_id == group_id,
                          StudySession.scheduled_at == data.scheduled_at)
                  .first())
    if conflict:
        raise HTTPException(status_code=409, detail="A session is already scheduled at that time for this group")

    new_session = StudySession(
        id=uuid4(),
        group_id=group_id,
        title=data.title,
        scheduled_at=data.scheduled_at,
        # duration_minutes is not part of StudySessionCreate; the model defaults it to 60.
        location=data.location,
        description=data.description,
        created_by=current_user["user_id"],
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # US-E.1: notify every group member (except the scheduler) that a session was
    # scheduled. Never let a notification failure break session creation.
    try:
        create_group_notifications(
            db,
            group_id=group_id,
            type="session",
            title="New session scheduled",
            message=f"{new_session.title} — {new_session.scheduled_at:%b %d, %H:%M}",
            link=f"/sessions/{new_session.id}",
            exclude_user_id=current_user["user_id"],
            meta={"session_id": str(new_session.id), "group_id": str(group_id)},
        )
    except Exception as e:  # pragma: no cover - notifications are best-effort
        print(f"[sessions-service] failed to create session notifications: {e}")

    return new_session

# US-C.5 @author: Fahad Sohail
@app.get("/sessions/{session_id}", response_model=StudySessionDetailResponse)
async def get_session(session_id: str, db: Session = Depends(get_db),
                      current_user: dict = Depends(get_current_user)):
    """Get session detail with attendee list."""
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    attendee_rows = (db.query(SessionRSVP, User.name)
                        .join(User, User.id == SessionRSVP.user_id)
                        .filter(SessionRSVP.session_id == session_id)
                        .all())
    result = StudySessionDetailResponse.model_validate(session)
    result.attendees = [
        SessionRSVPResponse(
            id=rsvp.id, session_id=rsvp.session_id, user_id=rsvp.user_id,
            status=rsvp.status.value if hasattr(rsvp.status, "value") else rsvp.status,
            created_at=rsvp.created_at, user_name=name or "Unknown",
        )
        for rsvp, name in attendee_rows
    ]
    return result

# US-C.5 @author: Fahad Sohail
@app.post("/sessions/{session_id}/rsvp", response_model=SessionRSVPResponse, status_code=201)
async def rsvp_session(session_id: str, data: SessionRSVPCreate,
                       db: Session = Depends(get_db),
                       current_user: dict = Depends(get_current_user)):
    """RSVP to a session (upsert — updates if already exists)."""
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.is_cancelled:
        raise HTTPException(status_code=400, detail="Cannot RSVP to a cancelled session")
    if _has_occurred(session.scheduled_at):
        raise HTTPException(status_code=400, detail="Cannot RSVP to a session that has already occurred")
    try:
        rsvp_status = SessionRSVPStatus(data.status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status. Use: {[s.value for s in SessionRSVPStatus]}")
    existing = (db.query(SessionRSVP)
                  .filter(SessionRSVP.session_id == session_id,
                          SessionRSVP.user_id == current_user["user_id"])
                  .first())
    if existing:
        existing.status = rsvp_status
        db.commit()
        db.refresh(existing)
        result = existing
    else:
        rsvp = SessionRSVP(id=uuid4(), session_id=session_id,
                           user_id=current_user["user_id"], status=rsvp_status)
        db.add(rsvp)
        db.commit()
        db.refresh(rsvp)
        result = rsvp

    actor = db.query(User).filter(User.id == current_user["user_id"]).first()

    # Notify the session's creator that someone RSVP'd (best-effort; skip self-RSVP).
    if str(session.created_by) != str(current_user["user_id"]):
        try:
            create_notification(
                db, user_id=session.created_by, type="session",
                title="Session RSVP",
                message=f"{actor.name if actor else 'A member'} RSVP'd {rsvp_status.value} to {session.title}",
                link=f"/sessions/{session_id}",
                meta={"session_id": str(session_id)},
            )
        except Exception as e:  # pragma: no cover
            print(f"[sessions-service] rsvp notification failed: {e}")

    return SessionRSVPResponse(
        id=result.id, session_id=result.session_id, user_id=result.user_id,
        status=result.status.value if hasattr(result.status, "value") else result.status,
        created_at=result.created_at, user_name=actor.name if actor else "Unknown",
    )

@app.put("/sessions/{session_id}", response_model=StudySessionResponse)
async def update_session(session_id: str, data: StudySessionUpdate,
                         db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Update a session (creator, group leader, or admin)."""
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not _can_manage_session(db, session, current_user):
        raise HTTPException(status_code=403, detail="Not allowed to edit this session")
    # US-C.4 @author: Uzma Alam
    if session.is_cancelled:
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled session")
    if _has_occurred(session.scheduled_at):
        raise HTTPException(status_code=400, detail="Cannot edit a session that has already occurred")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)

    try:
        create_group_notifications(
            db,
            group_id=str(session.group_id),
            type="session",
            title="Session updated",
            message=f"{session.title} — {session.scheduled_at:%b %d, %H:%M}",
            link=f"/sessions/{session.id}",
            exclude_user_id=current_user["user_id"],
            meta={"session_id": str(session.id), "group_id": str(session.group_id)},
        )
    except Exception as e:  # pragma: no cover - notifications are best-effort
        print(f"[sessions-service] failed to create session-update notifications: {e}")

    return session

# US-C.4 @author: Uzma Alam
@app.patch("/sessions/{session_id}/cancel", response_model=StudySessionResponse)
async def cancel_session(session_id: str, db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Cancel a session (creator, group leader, or admin)."""
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not _can_manage_session(db, session, current_user):
        raise HTTPException(status_code=403, detail="Not allowed to cancel this session")
    if session.is_cancelled:
        raise HTTPException(status_code=400, detail="Session is already cancelled")
    if _has_occurred(session.scheduled_at):
        raise HTTPException(status_code=400, detail="Cannot cancel a session that has already occurred")
    session.is_cancelled = True
    db.commit()
    db.refresh(session)

    try:
        create_group_notifications(
            db,
            group_id=str(session.group_id),
            type="session",
            title="Session cancelled",
            message=f"{session.title} — {session.scheduled_at:%b %d, %H:%M} has been cancelled",
            link=f"/sessions/{session.id}",
            exclude_user_id=current_user["user_id"],
            meta={"session_id": str(session.id), "group_id": str(session.group_id)},
        )
    except Exception as e:  # pragma: no cover - notifications are best-effort
        print(f"[sessions-service] failed to create session-cancel notifications: {e}")

    return session

# US-G.2 @author: Uzma Alam
@app.post("/sessions/{session_id}/summarize", status_code=201)
async def summarize_session_notes(
    session_id: str,
    notes: str,
    db: Session = Depends(get_db),
    
):
    """Summarize session notes using AI and save as a group resource."""
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.is_cancelled:
        raise HTTPException(status_code=400, detail="Cannot summarize a cancelled session")

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Groq API key not configured")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "user",
                        "content": f"""Summarize these session notes into:
1. A brief summary 
2. Key points 
3. Action items 

Notes:
{notes}"""
                    }
                ],
                "max_tokens": 1024,
            },
            timeout=30.0,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to get AI summary")

    summary = response.json()["choices"][0]["message"]["content"]

    return {"session_id": session_id, "summary": summary}

@app.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Delete a session (creator, group leader, or admin)."""
    session = _live_sessions(db).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not _can_manage_session(db, session, current_user):
        raise HTTPException(status_code=403, detail="Not allowed to delete this session")
    db.delete(session)
    db.commit()
    return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)