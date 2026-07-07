"""
services/notifications-service/main.py
Notification Centre service (US-E.1 @author: Ahmed).
Runs on port 8009.

Provides the read / unread-count / mark-read endpoints over the `notifications`
table. Notification *rows* are created by triggering services (e.g. Sessions) via
the helpers in shared_notifications.py — this service does not own creation, except
for a clearly marked dev-only seed endpoint used for demos.
"""
from uuid import UUID, uuid4
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import FastAPI, HTTPException, status, Depends, Query
from sqlalchemy.orm import Session

import sys
sys.path.append("/shared")
from shared_models import Notification, NotificationType, Base
from shared_database import engine, get_db
from shared_auth import get_current_user
from shared_schemas import (
    NotificationResponse, UnreadCountResponse,
    NotificationPreferencesResponse, NotificationPreferencesUpdate,
)
from shared_notifications import get_effective_preferences, set_preferences


def init_db():
    Base.metadata.create_all(bind=engine)


async def lifespan(app: FastAPI):
    print("Notifications Service starting...")
    init_db()
    yield
    print("Notifications Service shutting down...")


app = FastAPI(title="StudySync Notifications Service", version="1.0.0", lifespan=lifespan)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _to_response(n: Notification) -> NotificationResponse:
    """Map an ORM Notification to its response schema (meta -> metadata)."""
    return NotificationResponse(
        id=n.id,
        user_id=n.user_id,
        group_id=n.group_id,
        type=n.type,
        title=n.title,
        message=n.message,
        link=n.link,
        is_read=n.is_read,
        created_at=n.created_at,
        metadata=n.meta,
    )


def _ensure_self_or_admin(path_user_id: UUID, current_user: dict):
    """A user may only access their own notifications (admins may access any)."""
    if str(path_user_id) != str(current_user["user_id"]) and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to access these notifications")


# ----------------------------------------------------------------------------
# Routes
# NOTE: /notifications/health is declared before /notifications/{user_id} so it is
# never swallowed by the dynamic route.
# ----------------------------------------------------------------------------

@app.get("/notifications/health")
async def health():
    return {"status": "ok", "service": "notifications-service"}


# ----------------------------------------------------------------------------
# Notification preferences (US-E.5) — a user controls which categories they get.
# ----------------------------------------------------------------------------

@app.get("/notification-preferences/{user_id}", response_model=NotificationPreferencesResponse)
async def get_preferences(user_id: UUID, db: Session = Depends(get_db),
                          current_user: dict = Depends(get_current_user)):
    """Get a user's notification preferences (the user themselves, or an admin)."""
    if str(user_id) != str(current_user["user_id"]) and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to view these preferences")
    return NotificationPreferencesResponse(**get_effective_preferences(db, user_id))


@app.patch("/notification-preferences/{user_id}", response_model=NotificationPreferencesResponse)
async def update_preferences(user_id: UUID, data: NotificationPreferencesUpdate,
                             db: Session = Depends(get_db),
                             current_user: dict = Depends(get_current_user)):
    """Update a user's notification preferences (only your own)."""
    if str(user_id) != str(current_user["user_id"]):
        raise HTTPException(status_code=403, detail="You can only update your own preferences")
    updates = data.dict(exclude_unset=True)
    return NotificationPreferencesResponse(**set_preferences(db, user_id, updates))


@app.get("/notifications/{user_id}", response_model=List[NotificationResponse])
async def list_notifications(
    user_id: UUID,
    unread_only: bool = Query(False),
    type: Optional[str] = Query(None),
    limit: Optional[int] = Query(None, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List a user's notifications (newest first). Optional unread/type/limit filters."""
    _ensure_self_or_admin(user_id, current_user)

    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712
    if type:
        query = query.filter(Notification.type == type)
    query = query.order_by(Notification.created_at.desc())
    if limit:
        query = query.limit(limit)

    return [_to_response(n) for n in query.all()]


@app.get("/notifications/{user_id}/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return the number of unread notifications (used by the bell badge)."""
    _ensure_self_or_admin(user_id, current_user)
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .count()
    )
    return UnreadCountResponse(unread_count=count)


@app.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Mark a single notification as read."""
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    _ensure_self_or_admin(notification.user_id, current_user)

    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return _to_response(notification)


@app.patch("/notifications/{user_id}/read-all")
async def mark_all_read(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Mark all of a user's notifications as read."""
    _ensure_self_or_admin(user_id, current_user)
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
        .update({Notification.is_read: True}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


@app.delete("/notifications/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Dismiss / delete a notification."""
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    _ensure_self_or_admin(notification.user_id, current_user)

    db.delete(notification)
    db.commit()
    return None


# ----------------------------------------------------------------------------
# DEV / DEMO ONLY
# Seeds one notification of each type for the current user so the full
# Notification Centre UI can be demonstrated before the Announcement / Task
# services exist. Safe to remove for production.
# ----------------------------------------------------------------------------

@app.post("/notifications/dev/seed", response_model=List[NotificationResponse], status_code=201)
async def seed_demo_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    samples = [
        (NotificationType.SESSION.value, "New session scheduled",
         "Algorithms review — Jul 02, 14:00", "/sessions"),
        (NotificationType.ANNOUNCEMENT.value, "New announcement",
         "Midterm moved to next Friday — please read.", "/groups"),
        (NotificationType.TASK.value, "Task assigned to you",
         "Prepare slides for chapter 4.", "/dashboard"),
        (NotificationType.RESOURCE.value, "New resource shared",
         "lecture-notes-week3.pdf was added to your group.", "/resources"),
        (NotificationType.SYSTEM.value, "Welcome to StudySync",
         "Your Notification Centre is ready.", "/dashboard"),
    ]
    created: List[Notification] = []
    for ntype, title, message, link in samples:
        n = Notification(
            id=uuid4(), user_id=user_id, group_id=None,
            type=ntype, title=title, message=message, link=link, is_read=False,
        )
        db.add(n)
        created.append(n)
    db.commit()
    for n in created:
        db.refresh(n)
    return [_to_response(n) for n in created]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)
