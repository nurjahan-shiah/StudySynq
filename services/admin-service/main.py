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
from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Session

import sys

sys.path.append("/shared")

from shared_models import User, Course, Base
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


async def lifespan(app: FastAPI):
    print("⚙️  Admin Service starting…")
    Base.metadata.create_all(bind=engine)
    _ensure_is_active_column()
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
        "group_leader",
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
        "group_leader",
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