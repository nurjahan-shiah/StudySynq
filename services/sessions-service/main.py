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
sys.path.append("/shared")
from shared_models import StudySession, Group, GroupMembership, GroupMembershipRole, Base
from shared_database import engine, get_db
from shared_auth import get_current_user
from shared_schemas import StudySessionCreate, StudySessionUpdate, StudySessionResponse, StudySessionDetailResponse, SessionRSVPCreate, SessionRSVPResponse
from shared_models import SessionRSVP, SessionRSVPStatus
from shared_notifications import create_group_notifications  # US-E.1

def init_db():
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    print("Sessions Service starting...")
    init_db()
    yield
    print("Sessions Service shutting down...")

app = FastAPI(title="StudySync Sessions Service", version="1.0.0", lifespan=lifespan)

@app.get("/sessions/health")
async def health():
    return {"status": "ok", "service": "sessions-service"}

@app.get("/groups/{group_id}/sessions", response_model=list[StudySessionResponse])
async def list_sessions(group_id: str, db: Session = Depends(get_db),
                        current_user: dict = Depends(get_current_user)):
    """List all sessions for a group."""
    return (db.query(StudySession)
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
    conflict = (db.query(StudySession)
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
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    attendees = db.query(SessionRSVP).filter(SessionRSVP.session_id == session_id).all()
    result = StudySessionDetailResponse.model_validate(session)
    result.attendees = [SessionRSVPResponse.model_validate(a) for a in attendees]
    return result

# US-C.5 @author: Fahad Sohail
@app.post("/sessions/{session_id}/rsvp", response_model=SessionRSVPResponse, status_code=201)
async def rsvp_session(session_id: str, data: SessionRSVPCreate,
                       db: Session = Depends(get_db),
                       current_user: dict = Depends(get_current_user)):
    """RSVP to a session (upsert — updates if already exists)."""
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
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
        return existing
    rsvp = SessionRSVP(id=uuid4(), session_id=session_id,
                       user_id=current_user["user_id"], status=rsvp_status)
    db.add(rsvp)
    db.commit()
    db.refresh(rsvp)
    return rsvp

@app.put("/sessions/{session_id}", response_model=StudySessionResponse)
async def update_session(session_id: str, data: StudySessionUpdate,
                         db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Update a session (creator or admin only)."""
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.created_by) != str(current_user["user_id"]) and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to edit this session")
    # US-C.4 @author: Uzma Alam
    if session.is_cancelled:
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled session")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)
    return session

# US-C.4 @author: Uzma Alam
@app.patch("/sessions/{session_id}/cancel", response_model=StudySessionResponse)
async def cancel_session(session_id: str, db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Cancel a session (creator or admin only)."""
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.created_by) != str(current_user["user_id"]) and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to cancel this session")
    if session.is_cancelled:
        raise HTTPException(status_code=400, detail="Session is already cancelled")
    session.is_cancelled = True
    db.commit()
    db.refresh(session)
    return session

@app.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """Delete a session (creator or admin only)."""
    session = db.query(StudySession).filter(StudySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.created_by) != str(current_user["user_id"]) and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to delete this session")
    db.delete(session)
    db.commit()
    return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)