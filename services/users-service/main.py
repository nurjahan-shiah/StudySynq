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
import json
import os

import httpx

# Import shared utilities
import sys
sys.path.append("/shared")
from shared_models import User, Course, UserEnrollment, Base
from shared_database import SessionLocal, engine, get_db
from shared_auth import get_current_user
from shared_schemas import (
    UserProfile,
    UserUpdate,
    CourseResponse,
    OnboardingSuggestionRequest,
    OnboardingSuggestionResponse,
)

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

@app.post("/users/onboarding/suggest-courses", response_model=OnboardingSuggestionResponse)
async def suggest_onboarding_courses(
    body: OnboardingSuggestionRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    US-G.5 — AI Onboarding Course Suggestions (extends US-A.1)

    Given a student's program and year, ask an LLM to pick the courses from
    StudySync's own catalogue that a student in that program/year is most
    likely enrolled in. The model is only allowed to choose from the real
    course_code values passed in — this stops it from hallucinating courses
    that don't exist in our catalogue.
    """
    catalogue = db.query(Course).order_by(Course.course_code).all()

    if not catalogue:
        return OnboardingSuggestionResponse(courses=[], note="No courses in the catalogue yet.")

    catalogue_lines = "\n".join(
        f"- {c.course_code}: {c.course_name} ({c.department})" for c in catalogue
    )
    valid_codes = {c.course_code for c in catalogue}

    api_key = os.getenv("GROQ_API_KEY")
    suggested_codes: list[str] = []
    note = None

    if api_key:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [
                            {
                                "role": "user",
                                "content": f"""A student has just signed up for StudySync.
Program: {body.program}
Year: {body.year}

Here is the full course catalogue (course_code: course_name (department)):
{catalogue_lines}

Pick the course_code values (from the catalogue above ONLY — never invent one)
that a student in this program and year is most likely to be enrolled in
this term. Return 3-8 courses if that many reasonably fit, fewer if the
catalogue is small.

Respond with ONLY a JSON array of course_code strings, nothing else.
Example: ["EECS 3101", "EECS 3311"]""",
                            }
                        ],
                        "max_tokens": 256,
                        "temperature": 0.2,
                    },
                    timeout=20.0,
                )

            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"].strip()
                # Models sometimes wrap JSON in a code fence despite instructions.
                if content.startswith("```"):
                    content = content.strip("`")
                    content = content.split("\n", 1)[-1] if "\n" in content else content
                parsed = json.loads(content)
                if isinstance(parsed, list):
                    suggested_codes = [c for c in parsed if isinstance(c, str)]
            else:
                note = "AI suggestion service returned an error; showing a basic match instead."
        except Exception:
            note = "AI suggestion service is unavailable; showing a basic match instead."
    else:
        note = "AI suggestions are not configured; showing a basic match instead."

    # Only trust codes that actually exist in our catalogue.
    suggested_codes = [code for code in suggested_codes if code in valid_codes]

    # Fallback when the AI is unavailable or returned nothing usable: a
    # lightweight keyword match between the program name and department,
    # so the endpoint always returns something useful.
    if not suggested_codes:
        program_lower = body.program.lower()
        fallback = [
            c for c in catalogue
            if c.department.lower() in program_lower or program_lower in c.department.lower()
        ]
        suggested_codes = [c.course_code for c in (fallback or catalogue)[:6]]
        if note is None:
            note = "Showing a basic match based on your program's department."

    by_code = {c.course_code: c for c in catalogue}
    matched = [by_code[code] for code in suggested_codes if code in by_code]

    return OnboardingSuggestionResponse(
        courses=[
            CourseResponse(
                id=c.id,
                course_code=c.course_code,
                course_name=c.course_name,
                department=c.department,
            )
            for c in matched
        ],
        note=note,
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