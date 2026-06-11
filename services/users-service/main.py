"""
services/users-service/main.py
Users Service
- Get user profile
- Update user profile
- Manage course enrollments
- Get user's enrolled courses

Runs on port 8002
"""

from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from contextlib import asynccontextmanager

# Import shared utilities
import sys
sys.path.append("/shared")
from shared_models import User, Course, UserEnrollment, Base
from shared_database import SessionLocal, engine, get_db
from shared_auth import get_current_user
from shared_schemas import UserProfile, UserUpdate, CourseResponse

# ============================================================================
# Initialize Database
# ============================================================================

def init_db():
    """Create tables if they don't exist."""
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    print("👤 Users Service starting...")
    init_db()
    yield
    print("🛑 Users Service shutting down...")

app = FastAPI(
    title="StudySync Users Service",
    description="User profile and enrollment management",
    version="1.0.0",
    lifespan=lifespan
)

# ============================================================================
# Routes
# ============================================================================

@app.get("/users/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "users-service"}

@app.get("/users/{user_id}", response_model=UserProfile)
async def get_user(user_id: UUID, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """
    Get user profile by ID.
    Any authenticated user can view any user's profile (read-only).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role.value,
        created_at=user.created_at
    )

@app.put("/users/{user_id}", response_model=UserProfile)
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update user profile.
    Users can only update their own profile (or admins can update any).
    """
    # Check authorization: user can update own profile, or is admin
    if str(current_user["user_id"]) != str(user_id) and current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update another user's profile"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields if provided
    if user_data.name:
        user.name = user_data.name
    if user_data.email:
        # Check if email is already taken
        existing = db.query(User).filter(
            User.email == user_data.email,
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already in use"
            )
        user.email = user_data.email
    
    db.commit()
    db.refresh(user)
    
    return UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role.value,
        created_at=user.created_at
    )

@app.get("/users/{user_id}/enrollments", response_model=List[CourseResponse])
async def get_user_enrollments(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get all courses a user is enrolled in.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    enrollments = db.query(UserEnrollment).filter(
        UserEnrollment.user_id == user_id
    ).all()
    
    courses = []
    for enrollment in enrollments:
        course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        if course:
            courses.append(CourseResponse(
                id=course.id,
                course_code=course.course_code,
                course_name=course.course_name,
                department=course.department
            ))
    
    return courses

@app.post("/users/{user_id}/enrollments")
async def enroll_in_course(
    user_id: UUID,
    course_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Enroll a user in a course.
    Users can enroll themselves; admins can enroll anyone.
    """
    # Authorization check
    if str(current_user["user_id"]) != str(user_id) and current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot enroll another user"
        )
    
    # Check user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check course exists
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    # Check if already enrolled
    existing = db.query(UserEnrollment).filter(
        UserEnrollment.user_id == user_id,
        UserEnrollment.course_id == course_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already enrolled in this course"
        )
    
    # Create enrollment
    enrollment = UserEnrollment(
        user_id=user_id,
        course_id=course_id
    )
    db.add(enrollment)
    db.commit()
    
    return {"status": "enrolled", "course_code": course.course_code}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)