"""
shared/notifications.py
Reusable helpers for creating notifications (US-E.1 @author: Ahmed).

All microservices share the same PostgreSQL database, so triggering services
(Sessions now; Announcements / Tasks later) create notifications by writing rows
directly through these helpers — no extra network hop, and a single place to keep
the fan-out logic consistent.

Usage (e.g. inside sessions-service after a session is created):

    from shared_notifications import create_group_notifications

    create_group_notifications(
        db,
        group_id=group_id,
        type="session",
        title="New session scheduled",
        message=f"{title} on {when}",
        link=f"/sessions/{session_id}",
        exclude_user_id=current_user["user_id"],
        meta={"session_id": str(session_id)},
    )
"""

from typing import Optional, List
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from shared_models import Notification, GroupMembership


def create_notification(
    db: Session,
    *,
    user_id: UUID,
    type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    group_id: Optional[UUID] = None,
    meta: Optional[dict] = None,
    commit: bool = True,
) -> Notification:
    """Create a single notification for one user."""
    notification = Notification(
        id=uuid4(),
        user_id=user_id,
        group_id=group_id,
        type=type,
        title=title,
        message=message,
        link=link,
        is_read=False,
        meta=meta,
    )
    db.add(notification)
    if commit:
        db.commit()
        db.refresh(notification)
    return notification


def create_group_notifications(
    db: Session,
    *,
    group_id: UUID,
    type: str,
    title: str,
    message: str,
    link: Optional[str] = None,
    exclude_user_id: Optional[UUID] = None,
    meta: Optional[dict] = None,
) -> List[Notification]:
    """Fan out a notification to every member of a group.

    Skips ``exclude_user_id`` (typically the actor who triggered the event).
    Returns the list of notifications created. Commits once at the end.
    """
    memberships = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group_id)
        .all()
    )

    created: List[Notification] = []
    for membership in memberships:
        if exclude_user_id is not None and str(membership.user_id) == str(exclude_user_id):
            continue
        created.append(
            create_notification(
                db,
                user_id=membership.user_id,
                type=type,
                title=title,
                message=message,
                link=link,
                group_id=group_id,
                meta=meta,
                commit=False,
            )
        )

    if created:
        db.commit()
        for n in created:
            db.refresh(n)
    return created
