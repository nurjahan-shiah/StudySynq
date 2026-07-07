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

from shared_models import Course, Base
from shared_database import engine, get_db
from shared_auth import require_admin
from shared_schemas import (
    CourseCreate,
    CourseResponse,
)


def init_db():
    Base.metadata.create_all(bind=engine)


async def lifespan(app: FastAPI):
    print("📚 Courses Service starting...")
    init_db()
    yield
    print("🛑 Courses Service shutting down...")


app = FastAPI(
    title="StudySync Courses Service",
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