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

from shared_models import Notification, GroupMembership, NotificationPreference


# ============================================================================
# Notification preferences (US-E.5) — checked before any notification is created
# ============================================================================

# Preference categories and their default on/off state (used when a user has no
# stored row for that category).
PREFERENCE_CATEGORIES = ["sessions", "announcements", "tasks", "resources", "group_activity"]
DEFAULT_PREFERENCES = {
    "sessions": True,
    "announcements": True,
    "tasks": True,
    "resources": True,
    "group_activity": False,
}

# Map a notification `type` (singular, as created by the services) to its
# preference category. Types not listed here (e.g. "system") are always delivered.
_TYPE_TO_CATEGORY = {
    "session": "sessions",
    "announcement": "announcements",
    "task": "tasks",
    "resource": "resources",
}


def is_notification_enabled(db: Session, user_id: UUID, ntype: str) -> bool:
    """Whether the user wants notifications of this type. Defaults apply when the
    user has never changed the setting. Unknown/uncategorized types are always on."""
    category = _TYPE_TO_CATEGORY.get(ntype)
    if category is None:
        return True
    pref = (db.query(NotificationPreference)
              .filter(NotificationPreference.user_id == user_id,
                      NotificationPreference.notification_type == category)
              .first())
    if pref is None:
        return DEFAULT_PREFERENCES.get(category, True)
    return pref.is_enabled


def get_effective_preferences(db: Session, user_id: UUID) -> dict:
    """All categories with the user's effective on/off value (stored or default)."""
    rows = (db.query(NotificationPreference)
              .filter(NotificationPreference.user_id == user_id)
              .all())
    stored = {r.notification_type: r.is_enabled for r in rows}
    return {cat: stored.get(cat, DEFAULT_PREFERENCES[cat]) for cat in PREFERENCE_CATEGORIES}


def set_preferences(db: Session, user_id: UUID, updates: dict) -> dict:
    """Upsert the given {category: bool} changes, then return effective preferences."""
    for cat, val in updates.items():
        if cat not in PREFERENCE_CATEGORIES or val is None:
            continue
        pref = (db.query(NotificationPreference)
                  .filter(NotificationPreference.user_id == user_id,
                          NotificationPreference.notification_type == cat)
                  .first())
        if pref:
            pref.is_enabled = bool(val)
        else:
            db.add(NotificationPreference(
                id=uuid4(), user_id=user_id, notification_type=cat, is_enabled=bool(val),
            ))
    db.commit()
    return get_effective_preferences(db, user_id)


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
) -> Optional[Notification]:
    """Create a single notification for one user.

    Returns None (creating nothing) when the recipient has this notification
    category turned off in their preferences (US-E.5)."""
    if not is_notification_enabled(db, user_id, type):
        return None
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
        # create_notification returns None when this member has the category off.
        n = create_notification(
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
        if n is not None:
            created.append(n)

    if created:
        db.commit()
        for n in created:
            db.refresh(n)
    return created
