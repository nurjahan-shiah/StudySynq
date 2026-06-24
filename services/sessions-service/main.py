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
from shared_schemas import StudySessionCreate, StudySessionResponse



def init_db():
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    print("Starting Sessions Service...")
    init_db()
    yield
    print("Sessions Service shutting down...")

app = FastAPI(
    title="StudySync Sessions Service",
    description="Handles study session scheduling.",
    version="1.0.0",
    lifespan=lifespan,
)


# Health check 
@app.get("/sessions/health")
async def health():
    return {"status": "ok", "service": "sessions-service", "port": 8004}


# Verify group leader or admin role for scheduling sessions
def require_leader_or_admin(group_id: str, current_user: dict, db: Session):
    """
    Raises 403 if the current user is not a group leader or admin.
    """
    if current_user.get("role") == "admin":
        return
    membership = (
        db.query(GroupMembership)
        .filter(
            GroupMembership.group_id == group_id,
            GroupMembership.user_id == current_user["user_id"],
        )
        .first()
    )
    if not membership or membership.role != GroupMembershipRole.LEADER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group leaders can schedule sessions",
        )


# US-C.1  
# @author: Uzma Alam
# list all sessions for a group, ordered by scheduled date.

@app.get("/groups/{group_id}/sessions", response_model=list[StudySessionResponse])
async def list_sessions(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all sessions for a group, ordered by scheduled date."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    return (
        db.query(StudySession)
        .filter(StudySession.group_id == group_id)
        .order_by(StudySession.scheduled_at)
        .all()
    )


# create a new study session for a group. Only group leaders can create sessions.

@app.post(
    "/groups/{group_id}/sessions",
    response_model=StudySessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    group_id: str,
    data: StudySessionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
   
    # Verify group exists
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Verify caller is a leader or admin
    require_leader_or_admin(group_id, current_user, db)

    # Validate scheduled_at is in the future
    if data.scheduled_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scheduled_at must be a future date and time",
        )

    # Check for scheduling conflict within the same group
    conflict = (
        db.query(StudySession)
        .filter(
            StudySession.group_id == group_id,
            StudySession.scheduled_at == data.scheduled_at,
        )
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A session is already scheduled at that time for this group",
        )

    # Create and persist the new session
    new_session = StudySession(
        id=str(uuid4()),
        group_id=group_id,
        title=data.title,
        scheduled_at=data.scheduled_at,
        duration_minutes=data.duration_minutes,
        location=data.location,
        description=data.description,
        created_by=current_user["user_id"],
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return new_session


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)