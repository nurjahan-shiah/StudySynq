"""
services/admin-service/main.py
Admin Service — user/course management and moderation.
Runs on port 8007

US-F.1 endpoints
  M3: POST /admin/users/:id/deactivate   — soft-deactivate; deactivated users cannot log in
      Admin actions logged with timestamp (AdminAuditLog table)
  M4: GET  /admin/dashboard              — real counts for users + courses
      GET  /admin/users                  — full list with is_active, search/filter
      GET  /admin/courses                — full course list
      PUT  /admin/users/:id/role         — inline role change
      PUT  /admin/users/:id/reactivate   — un-deactivate
      POST /admin/courses                — create course
      DELETE /admin/courses/:id          — remove course
"""

from datetime import datetime
from uuid import uuid4
from typing import Optional

from fastapi import FastAPI, HTTPException, status, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Session

import sys

sys.path.append("/shared")

from shared_models import User, Course, Group, Resource, Announcement, GroupMembership, Base
from shared_database import engine, get_db
from shared_auth import require_admin as require_admin_user
from shared_schemas import CourseCreate, CourseResponse


# ============================================================================
# Audit log model
# ============================================================================

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4
    )
    admin_id = Column(
        PG_UUID(as_uuid=True),
        nullable=False
    )
    action = Column(
        String(100),
        nullable=False
    )
    target_id = Column(
        String(255),
        nullable=False
    )
    detail = Column(Text)
    performed_at = Column(
        DateTime,
        default=datetime.utcnow
    )


# US-F.2 — dedicated moderation audit trail (who deleted what content, when, why)
class ModerationLog(Base):
    __tablename__ = "moderation_logs"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    admin_id = Column(PG_UUID(as_uuid=True), nullable=False)
    entity_type = Column(String(20), nullable=False)   # group | resource | announcement
    entity_id = Column(String(255), nullable=False)
    action = Column(String(50), nullable=False, default="delete")
    reason = Column(Text, nullable=True)
    target_title = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================================
# Lifespan
# ============================================================================

def _ensure_is_active_column():
    """Add is_active to users table if the column does not exist yet."""
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [
            row[0]
            for row in conn.execute(
                text(
                    "SELECT column_name "
                    "FROM information_schema.columns "
                    "WHERE table_name='users' "
                    "AND column_name='is_active'"
                )
            )
        ]

        if not cols:
            conn.execute(
                text(
                    "ALTER TABLE users "
                    "ADD COLUMN is_active BOOLEAN "
                    "NOT NULL DEFAULT TRUE"
                )
            )
            conn.commit()


def _ensure_soft_delete_columns():
    """US-F.2: add moderation soft-delete columns to existing content tables.

    create_all() only creates missing tables, never alters existing ones, so
    long-lived groups/resources/announcements tables need these added explicitly.
    Idempotent (ADD COLUMN IF NOT EXISTS)."""
    from sqlalchemy import text

    with engine.connect() as conn:
        for table in ("groups", "resources", "announcements"):
            conn.execute(text(
                f"ALTER TABLE {table} "
                "ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE, "
                "ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP, "
                "ADD COLUMN IF NOT EXISTS deleted_by UUID"
            ))
        conn.commit()


async def lifespan(app: FastAPI):
    print("⚙️  Admin Service starting…")
    Base.metadata.create_all(bind=engine)
    _ensure_is_active_column()
    _ensure_soft_delete_columns()
    yield
    print("🛑 Admin Service shutting down…")


app = FastAPI(
    title="StudySync Admin Service",
    version="1.0.0",
    lifespan=lifespan
)


# ============================================================================
# Response schemas
# ============================================================================

class UserAdminView(BaseModel):
    id: str
    name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    total_users: int
    active_users: int
    deactivated_users: int
    total_courses: int


class RoleUpdate(BaseModel):
    role: str


# ============================================================================
# Helpers
# ============================================================================

def log_action(
    db: Session,
    admin_id,
    action: str,
    target_id: str,
    detail: str = ""
):
    entry = AdminAuditLog(
        id=uuid4(),
        admin_id=admin_id,
        action=action,
        target_id=str(target_id),
        detail=detail,
        performed_at=datetime.utcnow(),
    )

    db.add(entry)


def log_moderation(db, admin_id, entity_type, entity_id, action, reason, target_title):
    """US-F.2: record a moderation action. Caller commits."""
    entry = ModerationLog(
        id=uuid4(),
        admin_id=admin_id,
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        reason=reason,
        target_title=target_title,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    return entry


# ============================================================================
# Health
# ============================================================================

@app.get("/admin/health")
async def health():
    return {
        "status": "ok",
        "service": "admin-service"
    }


# ============================================================================
# M4 — Dashboard summary (real data)
# ============================================================================

@app.get(
    "/admin/dashboard",
    response_model=DashboardSummary
)
async def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    from sqlalchemy import text

    total_users = db.query(User).count()

    try:
        active = db.execute(
            text(
                "SELECT COUNT(*) "
                "FROM users "
                "WHERE is_active = TRUE"
            )
        ).scalar()

        inactive = db.execute(
            text(
                "SELECT COUNT(*) "
                "FROM users "
                "WHERE is_active = FALSE"
            )
        ).scalar()

    except Exception:
        active = total_users
        inactive = 0

    total_courses = db.query(Course).count()

    return DashboardSummary(
        total_users=total_users,
        active_users=int(active),
        deactivated_users=int(inactive),
        total_courses=total_courses,
    )


# ============================================================================
# US-F.6 — Platform Analytics Overview (admin-only, aggregated from PostgreSQL)
# ============================================================================

@app.get("/admin/analytics/overview")
async def analytics_overview(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    """Platform-wide usage stats for the admin analytics dashboard.

    Aggregated live from PostgreSQL; moderation-aware (excludes soft-deleted
    groups/resources/announcements)."""
    from sqlalchemy import text
    from datetime import timedelta

    def scalar(sql, **params):
        return int(db.execute(text(sql), params).scalar() or 0)

    # Current Mon–Sun week window for "sessions scheduled this week".
    now = datetime.utcnow()
    start_of_week = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end_of_week = start_of_week + timedelta(days=7)

    total_users = db.query(User).count()
    try:
        active_users = scalar("SELECT COUNT(*) FROM users WHERE is_active = TRUE")
    except Exception:
        active_users = total_users

    total_groups = scalar("SELECT COUNT(*) FROM groups WHERE is_deleted = FALSE")
    active_groups = scalar(
        "SELECT COUNT(*) FROM groups g WHERE g.is_deleted = FALSE AND ("
        " EXISTS (SELECT 1 FROM study_sessions s WHERE s.group_id = g.id)"
        " OR EXISTS (SELECT 1 FROM resources r WHERE r.group_id = g.id AND r.is_deleted = FALSE)"
        " OR EXISTS (SELECT 1 FROM announcements a WHERE a.group_id = g.id AND a.is_deleted = FALSE))"
    )
    sessions_this_week = scalar(
        "SELECT COUNT(*) FROM study_sessions "
        "WHERE scheduled_at >= :start AND scheduled_at < :end "
        "AND (is_cancelled IS NULL OR is_cancelled = FALSE)",
        start=start_of_week, end=end_of_week,
    )
    total_resources = scalar("SELECT COUNT(*) FROM resources WHERE is_deleted = FALSE")
    total_announcements = scalar("SELECT COUNT(*) FROM announcements WHERE is_deleted = FALSE")
    total_tasks = scalar("SELECT COUNT(*) FROM tasks")

    most_active_courses = [
        {
            "course_code": r["course_code"],
            "course_name": r["course_name"],
            "group_count": int(r["group_count"]),
            "session_count": int(r["session_count"]),
            "resource_count": int(r["resource_count"]),
            "member_count": int(r["member_count"]),
        }
        for r in db.execute(text(
            "SELECT * FROM ("
            "  SELECT c.course_code, c.course_name,"
            "    (SELECT COUNT(*) FROM group_courses gc WHERE gc.course_id = c.id) AS group_count,"
            "    (SELECT COUNT(*) FROM study_sessions s WHERE s.group_id IN"
            "       (SELECT group_id FROM group_courses WHERE course_id = c.id)) AS session_count,"
            "    (SELECT COUNT(*) FROM resources r WHERE r.is_deleted = FALSE AND r.group_id IN"
            "       (SELECT group_id FROM group_courses WHERE course_id = c.id)) AS resource_count,"
            "    (SELECT COUNT(DISTINCT gm.user_id) FROM group_memberships gm WHERE gm.group_id IN"
            "       (SELECT group_id FROM group_courses WHERE course_id = c.id)) AS member_count"
            "  FROM courses c"
            ") t WHERE t.group_count > 0"
            " ORDER BY t.session_count DESC, t.group_count DESC LIMIT 5"
        )).mappings().all()
    ]

    most_active_groups = [
        {
            "name": r["name"],
            "member_count": int(r["member_count"]),
            "session_count": int(r["session_count"]),
            "resource_count": int(r["resource_count"]),
        }
        for r in db.execute(text(
            "SELECT * FROM ("
            "  SELECT g.name,"
            "    (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) AS member_count,"
            "    (SELECT COUNT(*) FROM study_sessions s WHERE s.group_id = g.id) AS session_count,"
            "    (SELECT COUNT(*) FROM resources r WHERE r.group_id = g.id AND r.is_deleted = FALSE) AS resource_count"
            "  FROM groups g WHERE g.is_deleted = FALSE"
            ") t ORDER BY (t.session_count + t.resource_count) DESC, t.member_count DESC LIMIT 5"
        )).mappings().all()
    ]

    recent_activity = [
        {
            "type": r["type"],
            "title": r["title"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in db.execute(text(
            "SELECT type, title, created_at FROM ("
            "  SELECT 'group' AS type, name AS title, created_at FROM groups WHERE is_deleted = FALSE"
            "  UNION ALL SELECT 'session', title, created_at FROM study_sessions"
            "  UNION ALL SELECT 'resource', file_name, created_at FROM resources WHERE is_deleted = FALSE"
            "  UNION ALL SELECT 'announcement', title, created_at FROM announcements WHERE is_deleted = FALSE"
            "  UNION ALL SELECT 'task', title, created_at FROM tasks"
            ") t ORDER BY created_at DESC LIMIT 10"
        )).mappings().all()
    ]

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_groups": total_groups,
        "active_groups": active_groups,
        "sessions_this_week": sessions_this_week,
        "total_resources": total_resources,
        "total_announcements": total_announcements,
        "total_tasks": total_tasks,
        "most_active_courses": most_active_courses,
        "most_active_groups": most_active_groups,
        "recent_activity": recent_activity,
    }


# ============================================================================
# M4 — User list with search + filter
# ============================================================================

@app.get(
    "/admin/users",
    response_model=list[UserAdminView]
)
async def list_users(
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    q = db.query(User)

    if search:
        like = f"%{search}%"

        q = q.filter(
            (User.name.ilike(like))
            | (User.email.ilike(like))
        )

    if role and role in (
        "student",
        "admin"
    ):
        q = q.filter(User.role == role)

    rows = (
        q.order_by(User.created_at.desc())
        .all()
    )

    result = []

    for user in rows:
        is_active = getattr(
            user,
            "is_active",
            True
        )

        if active_only and not is_active:
            continue

        result.append(
            UserAdminView(
                id=str(user.id),
                name=user.name,
                email=user.email,
                role=(
                    user.role.value
                    if hasattr(user.role, "value")
                    else str(user.role)
                ),
                is_active=bool(is_active),
                created_at=user.created_at,
            )
        )

    return result


# ============================================================================
# M3 — Soft deactivate (blocks login; logged)
# ============================================================================

@app.post(
    "/admin/users/{user_id}/deactivate",
    status_code=200
)
async def deactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    if str(user_id) == str(
        current_user["user_id"]
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot deactivate your own account"
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    from sqlalchemy import text

    db.execute(
        text(
            "UPDATE users "
            "SET is_active = FALSE "
            "WHERE id = :uid"
        ),
        {"uid": user_id}
    )

    log_action(
        db,
        current_user["user_id"],
        "deactivate_user",
        user_id,
        f"Deactivated {user.email}"
    )

    db.commit()

    return {
        "status": "deactivated",
        "user_id": user_id,
        "logged_at": datetime.utcnow().isoformat(),
    }


@app.post(
    "/admin/users/{user_id}/reactivate",
    status_code=200
)
async def reactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    from sqlalchemy import text

    db.execute(
        text(
            "UPDATE users "
            "SET is_active = TRUE "
            "WHERE id = :uid"
        ),
        {"uid": user_id}
    )

    log_action(
        db,
        current_user["user_id"],
        "reactivate_user",
        user_id,
        f"Reactivated {user.email}"
    )

    db.commit()

    return {
        "status": "reactivated",
        "user_id": user_id
    }


# ============================================================================
# Inline role change (logged)
# ============================================================================

@app.put("/admin/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    if body.role not in (
        "student",
        "admin"
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid role"
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if (
        str(user.id)
        == str(current_user["user_id"])
        and body.role != "admin"
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot demote your own account"
        )

    old_role = getattr(
        user.role,
        "value",
        str(user.role)
    )

    user.role = body.role

    log_action(
        db,
        current_user["user_id"],
        "change_role",
        user_id,
        f"{user.email}: {old_role} → {body.role}"
    )

    db.commit()

    return {
        "status": "updated",
        "user_id": user_id,
        "role": body.role,
        "logged_at": datetime.utcnow().isoformat(),
    }


# ============================================================================
# M4 — Course list (admin)
# ============================================================================

@app.get(
    "/admin/courses",
    response_model=list[CourseResponse]
)
async def list_courses(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    q = db.query(Course)

    if search:
        like = f"%{search}%"

        q = q.filter(
            (Course.course_code.ilike(like))
            | (Course.course_name.ilike(like))
            | (Course.department.ilike(like))
        )

    return (
        q.order_by(Course.course_code)
        .all()
    )


@app.post(
    "/admin/courses",
    response_model=CourseResponse,
    status_code=201
)
async def admin_create_course(
    course_data: CourseCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    from sqlalchemy.exc import IntegrityError

    new_course = Course(
        id=uuid4(),
        course_code=course_data.course_code,
        course_name=course_data.course_name,
        department=course_data.department,
    )

    try:
        db.add(new_course)

        log_action(
            db,
            current_user["user_id"],
            "create_course",
            str(new_course.id),
            f"Created {course_data.course_code}"
        )

        db.commit()
        db.refresh(new_course)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Course code already exists"
        )

    return new_course


@app.delete(
    "/admin/courses/{course_id}",
    status_code=204
)
async def admin_delete_course(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    course = (
        db.query(Course)
        .filter(Course.id == course_id)
        .first()
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    log_action(
        db,
        current_user["user_id"],
        "delete_course",
        course_id,
        f"Deleted {course.course_code}"
    )

    db.delete(course)
    db.commit()

    return None


# ============================================================================
# Audit log
# ============================================================================

@app.get("/admin/audit-log")
async def get_audit_log(
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    logs = (
        db.query(AdminAuditLog)
        .order_by(
            AdminAuditLog.performed_at.desc()
        )
        .limit(limit)
        .all()
    )

    return [
        {
            "id": str(entry.id),
            "admin_id": str(entry.admin_id),
            "action": entry.action,
            "target_id": entry.target_id,
            "detail": entry.detail,
            "performed_at": (
                entry.performed_at.isoformat()
            ),
        }
        for entry in logs
    ]


# ============================================================================
# US-F.2 — Moderation Console & Audit Log
# ============================================================================

def _user_name(db: Session, user_id) -> str:
    u = db.query(User).filter(User.id == user_id).first()
    return u.name if u else "Unknown"


def _group_name(db: Session, group_id) -> str:
    g = db.query(Group).filter(Group.id == group_id).first()
    return g.name if g else "Unknown group"


@app.get("/admin/moderation/groups")
async def moderation_groups(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    q = db.query(Group).filter(Group.is_deleted == False)  # noqa: E712
    if search:
        q = q.filter(Group.name.ilike(f"%{search}%"))
    groups = q.order_by(Group.created_at.desc()).all()
    return [
        {
            "id": str(g.id),
            "name": g.name,
            "description": g.description,
            "created_by": str(g.created_by),
            "creator_name": _user_name(db, g.created_by),
            "member_count": db.query(GroupMembership).filter(GroupMembership.group_id == g.id).count(),
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in groups
    ]


@app.get("/admin/moderation/resources")
async def moderation_resources(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    q = db.query(Resource).filter(Resource.is_deleted == False)  # noqa: E712
    if search:
        q = q.filter(Resource.file_name.ilike(f"%{search}%"))
    resources = q.order_by(Resource.created_at.desc()).all()
    return [
        {
            "id": str(r.id),
            "file_name": r.file_name,
            "file_type": r.file_type,
            "uploaded_by": str(r.uploaded_by),
            "uploader_name": _user_name(db, r.uploaded_by),
            "group_id": str(r.group_id),
            "group_name": _group_name(db, r.group_id),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in resources
    ]


@app.get("/admin/moderation/announcements")
async def moderation_announcements(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    q = db.query(Announcement).filter(Announcement.is_deleted == False)  # noqa: E712
    if search:
        q = q.filter(Announcement.title.ilike(f"%{search}%"))
    anns = q.order_by(Announcement.created_at.desc()).all()
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "message": a.message,
            "author_id": str(a.author_id),
            "author_name": _user_name(db, a.author_id),
            "group_id": str(a.group_id),
            "group_name": _group_name(db, a.group_id),
            "is_pinned": a.is_pinned,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in anns
    ]


# entity name -> (model, title attribute)
_MODERATION_ENTITIES = {
    "group": (Group, "name"),
    "resource": (Resource, "file_name"),
    "announcement": (Announcement, "title"),
}


@app.delete("/admin/moderation/{entity}/{item_id}")
async def moderation_delete(
    entity: str,
    item_id: str,
    reason: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    """Soft-delete any group / resource / announcement and record it in the audit log."""
    if entity not in _MODERATION_ENTITIES:
        raise HTTPException(status_code=400, detail="Invalid entity. Use group, resource, or announcement.")

    model, title_attr = _MODERATION_ENTITIES[entity]
    item = db.query(model).filter(model.id == item_id).first()
    if not item or item.is_deleted:
        raise HTTPException(status_code=404, detail=f"{entity.capitalize()} not found")

    target_title = getattr(item, title_attr, None)
    item.is_deleted = True
    item.deleted_at = datetime.utcnow()
    item.deleted_by = current_user["user_id"]

    entry = log_moderation(
        db, current_user["user_id"], entity, item_id, "delete", reason, target_title,
    )
    db.commit()

    return {"message": f"{entity.capitalize()} deleted successfully", "log_id": str(entry.id)}


@app.post("/admin/moderation/{entity}/{item_id}/restore")
async def moderation_restore(
    entity: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    """Revert a soft-delete: make the item visible again and record the restore."""
    if entity not in _MODERATION_ENTITIES:
        raise HTTPException(status_code=400, detail="Invalid entity. Use group, resource, or announcement.")

    model, title_attr = _MODERATION_ENTITIES[entity]
    item = db.query(model).filter(model.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"{entity.capitalize()} not found")
    if not item.is_deleted:
        raise HTTPException(status_code=400, detail=f"{entity.capitalize()} is not currently deleted")

    target_title = getattr(item, title_attr, None)
    item.is_deleted = False
    item.deleted_at = None
    item.deleted_by = None

    entry = log_moderation(
        db, current_user["user_id"], entity, item_id, "restore", None, target_title,
    )
    db.commit()

    return {"message": f"{entity.capitalize()} restored successfully", "log_id": str(entry.id)}


@app.get("/admin/moderation/audit-logs")
async def moderation_audit_logs(
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    logs = (
        db.query(ModerationLog)
        .order_by(ModerationLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(e.id),
            "admin_id": str(e.admin_id),
            "admin_name": _user_name(db, e.admin_id),
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "action": e.action,
            "reason": e.reason,
            "target_title": e.target_title,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in logs
    ]


# ============================================================================
# Legacy hard-delete (kept for backward compat)
# ============================================================================

@app.delete(
    "/admin/users/{user_id}",
    status_code=204
)
async def hard_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin_user),
):
    if str(user_id) == str(
        current_user["user_id"]
    ):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    log_action(
        db,
        current_user["user_id"],
        "hard_delete_user",
        user_id,
        f"Hard-deleted {user.email}"
    )

    db.delete(user)
    db.commit()

    return None


# ============================================================================
# Auth-service login guard hook (call from auth-service)
# ============================================================================

@app.get("/admin/users/{user_id}/is-active")
async def check_user_active(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Called by auth-service before issuing a token.
    Returns 200 {active: true/false}.
    No auth required — internal network only.
    """
    from sqlalchemy import text

    try:
        row = db.execute(
            text(
                "SELECT is_active "
                "FROM users "
                "WHERE id = :uid"
            ),
            {"uid": user_id}
        ).fetchone()

        active = (
            bool(row[0])
            if row
            else False
        )

    except Exception:
        # Fail open if column does not exist yet
        active = True

    return {
        "user_id": user_id,
        "active": active
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8007
    )