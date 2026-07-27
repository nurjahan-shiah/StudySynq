"""
services/courses-service/main.py
Courses Service - course catalogue and administration.
Runs on port 8006
"""

from uuid import uuid4

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import sys

sys.path.append("/shared")

from shared_models import Course, CourseRequest, CourseRequestStatus, User, UserRole, Base
from shared_database import engine, get_db, run_light_migrations
from shared_auth import require_admin, get_current_user
from shared_notifications import create_notification
from shared_schemas import (
    CourseCreate,
    CourseResponse,
    CourseRequestCreate,
    CourseRequestResolve,
    CourseRequestResponse,
    derive_year_level,
)


def init_db():
    Base.metadata.create_all(bind=engine)
    run_light_migrations(engine)


async def lifespan(app: FastAPI):
    print("📚 Courses Service starting...")
    init_db()
    yield
    print("🛑 Courses Service shutting down...")


app = FastAPI(
    title="StudySynq Courses Service",
    version="1.0.0",
    lifespan=lifespan
)


@app.get("/courses/health")
async def health():
    return {
        "status": "ok",
        "service": "courses-service"
    }


@app.get(
    "/courses",
    response_model=list[CourseResponse]
)
async def list_courses(
    db: Session = Depends(get_db)
):
    """List all courses."""
    return (
        db.query(Course)
        .order_by(Course.course_code)
        .all()
    )


# ============================================================================
# Course Requests — students request missing courses; admins approve/reject.
# NOTE: FastAPI matches routes in registration order, so these literal
# /courses/requests* paths are registered BEFORE /courses/{course_id}
# to keep "requests" from being captured as a course id.
# ============================================================================


def _request_to_response(db: Session, req: CourseRequest) -> CourseRequestResponse:
    requester = db.query(User).filter(User.id == req.requested_by).first()
    return CourseRequestResponse(
        id=req.id,
        requested_by=req.requested_by,
        requester_name=requester.name if requester else "Unknown",
        course_code=req.course_code,
        course_name=req.course_name,
        department=req.department,
        status=req.status,
        reason=req.reason,
        admin_note=req.admin_note,
        created_at=req.created_at,
        resolved_at=req.resolved_at,
    )


@app.post(
    "/courses/requests",
    response_model=CourseRequestResponse,
    status_code=201,
)
async def request_course(
    body: CourseRequestCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """A student requests a course that isn't in the catalogue.

    Every admin gets a live notification; the requester is notified again when
    the request is approved (course created) or rejected.
    """
    # Already in the catalogue? Courses cannot be repeated — just enroll.
    existing = (
        db.query(Course)
        .filter(Course.course_code == body.course_code)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"{body.course_code} already exists — you can enroll in it from the catalogue.",
        )

    # One pending request per course code is enough.
    pending = (
        db.query(CourseRequest)
        .filter(
            CourseRequest.course_code == body.course_code,
            CourseRequest.status == CourseRequestStatus.PENDING.value,
        )
        .first()
    )
    if pending:
        raise HTTPException(
            status_code=400,
            detail=f"A request for {body.course_code} is already pending admin review.",
        )

    req = CourseRequest(
        id=uuid4(),
        requested_by=current_user["user_id"],
        course_code=body.course_code,
        course_name=body.course_name,
        department=body.department.strip(),
        reason=body.reason,
        status=CourseRequestStatus.PENDING.value,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Live notification to every admin.
    requester = db.query(User).filter(User.id == current_user["user_id"]).first()
    requester_name = requester.name if requester else "A student"
    admins = db.query(User).filter(User.role == UserRole.ADMIN).all()
    for admin in admins:
        create_notification(
            db,
            user_id=admin.id,
            type="system",
            title="New course request",
            message=f"{requester_name} requested {req.course_code} — {req.course_name}",
            link="/courses?tab=requests",
            meta={"course_request_id": str(req.id)},
            commit=False,
        )
    db.commit()

    return _request_to_response(db, req)


@app.get(
    "/courses/requests",
    response_model=list[CourseRequestResponse],
)
async def list_course_requests(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """List course requests (admin only). Filter with ?status=pending."""
    q = db.query(CourseRequest)
    if status:
        q = q.filter(CourseRequest.status == status)
    requests = q.order_by(CourseRequest.created_at.desc()).all()
    return [_request_to_response(db, r) for r in requests]


@app.get(
    "/courses/requests/mine",
    response_model=list[CourseRequestResponse],
)
async def my_course_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The logged-in student's own requests, newest first."""
    requests = (
        db.query(CourseRequest)
        .filter(CourseRequest.requested_by == current_user["user_id"])
        .order_by(CourseRequest.created_at.desc())
        .all()
    )
    return [_request_to_response(db, r) for r in requests]


@app.post(
    "/courses/requests/{request_id}/approve",
    response_model=CourseRequestResponse,
)
async def approve_course_request(
    request_id: str,
    body: CourseRequestResolve | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin approves: the course is created and the requester is notified."""
    from datetime import datetime

    req = db.query(CourseRequest).filter(CourseRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != CourseRequestStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    # Create the course (unless someone created it manually in the meantime).
    course = db.query(Course).filter(Course.course_code == req.course_code).first()
    if not course:
        course = Course(
            id=uuid4(),
            course_code=req.course_code,
            course_name=req.course_name,
            department=req.department,
            year_level=derive_year_level(req.course_code),
        )
        try:
            db.add(course)
            db.flush()
        except IntegrityError:
            db.rollback()
            course = db.query(Course).filter(Course.course_code == req.course_code).first()

    req.status = CourseRequestStatus.APPROVED.value
    req.resolved_at = datetime.utcnow()
    req.resolved_by = current_user["user_id"]
    if body and body.admin_note:
        req.admin_note = body.admin_note

    create_notification(
        db,
        user_id=req.requested_by,
        type="system",
        title="Course request accepted",
        message=f"{req.course_code} — {req.course_name} is now in the catalogue. You can enroll!",
        link="/courses?tab=browse",
        meta={"course_request_id": str(req.id)},
        commit=False,
    )
    db.commit()
    db.refresh(req)
    return _request_to_response(db, req)


@app.post(
    "/courses/requests/{request_id}/reject",
    response_model=CourseRequestResponse,
)
async def reject_course_request(
    request_id: str,
    body: CourseRequestResolve | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Admin rejects: the requester is notified."""
    from datetime import datetime

    req = db.query(CourseRequest).filter(CourseRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != CourseRequestStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = CourseRequestStatus.REJECTED.value
    req.resolved_at = datetime.utcnow()
    req.resolved_by = current_user["user_id"]
    if body and body.admin_note:
        req.admin_note = body.admin_note

    note = f" Note from admin: {req.admin_note}" if req.admin_note else ""
    create_notification(
        db,
        user_id=req.requested_by,
        type="system",
        title="Course request rejected",
        message=f"Your request for {req.course_code} — {req.course_name} was not approved.{note}",
        link="/courses?tab=requests",
        meta={"course_request_id": str(req.id)},
        commit=False,
    )
    db.commit()
    db.refresh(req)
    return _request_to_response(db, req)



@app.get(
    "/courses/{course_id}",
    response_model=CourseResponse
)
async def get_course(
    course_id: str,
    db: Session = Depends(get_db)
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

    return course


@app.post(
    "/courses",
    response_model=CourseResponse,
    status_code=201
)
async def create_course(
    course_data: CourseCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Create a course (admin only)."""
    new_course = Course(
        id=uuid4(),
        course_code=course_data.course_code,
        course_name=course_data.course_name,
        department=course_data.department,
        faculty=course_data.faculty,
        year_level=course_data.year_level or derive_year_level(course_data.course_code),
    )

    try:
        db.add(new_course)
        db.commit()
        db.refresh(new_course)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=400,
            detail="Course code already exists"
        )

    return new_course


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8006
    )