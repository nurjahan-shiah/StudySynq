"""
shared/schemas.py
Pydantic request/response schemas used across microservices.
Defines the contract between services and clients.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr

# ============================================================================
# Auth Schemas
# ============================================================================

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    user_email: str

# ============================================================================
# User Schemas
# ============================================================================

class UserBase(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    created_at: datetime

class UserProfile(UserBase):
    pass

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

# ============================================================================
# Course Schemas
# ============================================================================

class CourseBase(BaseModel):
    course_code: str
    course_name: str
    department: str

class CourseCreate(CourseBase):
    pass

class CourseResponse(CourseBase):
    id: UUID

    class Config:
        from_attributes = True

# ============================================================================
# Group Schemas
# ============================================================================

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: bool = True

class GroupCreate(GroupBase):
    course_ids: Optional[List[UUID]] = []

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None

class GroupResponse(GroupBase):
    id: UUID
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class GroupDetailResponse(GroupResponse):
    member_count: int = 0
    course_codes: List[str] = []

# ============================================================================
# Group Membership Schemas
# ============================================================================

class GroupMemberResponse(BaseModel):
    user_id: UUID
    user_name: str
    user_email: str
    membership_role: str

# ============================================================================
# Study Session Schemas
# ============================================================================

class StudySessionBase(BaseModel):
    title: str
    scheduled_at: datetime
    location: Optional[str] = None
    description: Optional[str] = None

class StudySessionCreate(StudySessionBase):
    pass

class StudySessionUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    description: Optional[str] = None

class StudySessionResponse(StudySessionBase):
    id: UUID
    group_id: UUID
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# Resource Schemas
# ============================================================================

class ResourceBase(BaseModel):
    file_name: str
    file_url: str
    file_type: str

class ResourceResponse(ResourceBase):
    id: UUID
    group_id: UUID
    uploaded_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# ============================================================================
# Recommendation Schemas
# ============================================================================

class RecommendationResponse(BaseModel):
    group_id: UUID
    group_name: str
    group_description: Optional[str]
    score: int
    course_codes: List[str]

    class Config:
        from_attributes = True

# ============================================================================
# Error Schemas
# ============================================================================

class ErrorResponse(BaseModel):
    detail: str
    status_code: int