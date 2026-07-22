"""
shared/schemas.py
Pydantic request/response schemas used across microservices.
Defines the contract between services and clients.
"""

from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, PlainSerializer, field_validator


def _serialize_utc(value: Optional[datetime]) -> Optional[str]:
    """Emit an ISO-8601 string that is explicitly UTC.

    Datetime columns here are naive `DateTime` (UTC by convention), so a
    plain `.isoformat()` yields "2026-07-25T15:00:00" with no designator —
    and `new Date(...)` in the browser reads a bare date-time like that as
    *local* time, silently shifting every timestamp by the viewer's offset.
    Tagging the value as +00:00 lets the frontend convert correctly.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


# Use in place of `datetime` on any response schema field.
UTCDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]


def _coerce_date_only(v):
    """Accept a date-only 'YYYY-MM-DD' (e.g. from an <input type=date>) as midnight."""
    if isinstance(v, str) and len(v) == 10 and v.count("-") == 2:
        return v + "T00:00:00"
    return v

# ============================================================================
# Auth Schemas
# ============================================================================

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "student"

    @field_validator("name")
    @classmethod
    def name_reasonable(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 100):
            raise ValueError("Name must be 1-100 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        # US-A.1 acceptance: password strength rules enforced at the schema
        # boundary so every service inherits them.
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password must be at most 128 characters")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    user_email: str
    user_role: str = "student"
    is_first_login: bool = False

# ============================================================================
# User Schemas
# ============================================================================

class UserBase(BaseModel):
    id: UUID
    name: str
    email: str
    role: str
    created_at: UTCDatetime

PROFILE_PRIVACY_FIELDS = {"major", "year_of_study", "bio", "email"}

class UserProfile(UserBase):
    # ── Complete your profile ────────────────────────────────────────────────
    major: Optional[str] = None
    year_of_study: Optional[str] = None
    bio: Optional[str] = None
    profile_privacy: Optional[Dict[str, str]] = None
    # True once major + year are set; drives the Recommended tab gating.
    profile_complete: bool = False

class PublicUserCard(BaseModel):
    """Privacy-filtered view of another user (social feed mini-profile)."""
    id: UUID
    name: str
    major: Optional[str] = None
    year_of_study: Optional[str] = None
    bio: Optional[str] = None
    email: Optional[str] = None
    groups: List[str] = []
    friend_status: str = "none"   # none | pending_out | pending_in | friends

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    major: Optional[str] = None
    year_of_study: Optional[str] = None
    bio: Optional[str] = None
    profile_privacy: Optional[Dict[str, str]] = None

    @field_validator("bio")
    @classmethod
    def bio_reasonable(cls, v):
        if v is not None and len(v) > 1000:
            raise ValueError("Bio must be at most 1000 characters")
        return v

    @field_validator("profile_privacy")
    @classmethod
    def privacy_shape(cls, v):
        if v is None:
            return v
        cleaned = {}
        for k, val in v.items():
            if k not in PROFILE_PRIVACY_FIELDS:
                continue
            if val not in ("public", "private"):
                raise ValueError("Privacy values must be 'public' or 'private'")
            cleaned[k] = val
        return cleaned

# ============================================================================
# Course Schemas
# ============================================================================

import re

# York course codes: 2-5 letter subject + space + 4-digit number, e.g. "EECS 4314".
YORK_COURSE_CODE_RE = re.compile(r"^[A-Z]{2,5} \d{4}$")

def normalize_york_course_code(v: str) -> str:
    """Uppercase, collapse whitespace, and insert the space if missing
    ("eecs4314" -> "EECS 4314"). Raises ValueError when it still doesn't
    match the York format."""
    v = re.sub(r"\s+", " ", (v or "").strip().upper())
    if " " not in v:
        m = re.match(r"^([A-Z]{2,5})(\d{4})$", v)
        if m:
            v = f"{m.group(1)} {m.group(2)}"
    if not YORK_COURSE_CODE_RE.match(v):
        raise ValueError(
            "Course code must be a York code like 'EECS 4314' "
            "(2-5 letters, a space, then 4 digits)"
        )
    return v

def derive_year_level(course_code: str) -> Optional[int]:
    """First digit of the 4-digit number: 'EECS 4314' -> 4 (capped at 5)."""
    parts = course_code.split()
    if len(parts) == 2 and parts[1][:1].isdigit():
        return min(int(parts[1][0]), 5)
    return None

class CourseBase(BaseModel):
    course_code: str
    course_name: str
    department: str
    # Course identifiers: faculty + year level ("EECS 4413" -> level 4).
    faculty: Optional[str] = None
    year_level: Optional[int] = None

class CourseCreate(CourseBase):
    # Courses cannot be repeated (unique constraint) and, for now, only York
    # codes like "EECS 4314" are accepted.
    @field_validator("course_code")
    @classmethod
    def valid_york_code(cls, v: str) -> str:
        return normalize_york_course_code(v)

    @field_validator("course_name")
    @classmethod
    def name_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not (1 <= len(v) <= 255):
            raise ValueError("Course name must be 1-255 characters")
        return v

    @field_validator("year_level", mode="after")
    @classmethod
    def level_range(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("Year level must be 1-5")
        return v

class CourseUpdate(BaseModel):
    """Admin edit — any subset of fields."""
    course_code: Optional[str] = None
    course_name: Optional[str] = None
    department: Optional[str] = None
    faculty: Optional[str] = None
    year_level: Optional[int] = None

    @field_validator("course_code")
    @classmethod
    def valid_york_code(cls, v):
        return normalize_york_course_code(v) if v is not None else v

    @field_validator("year_level")
    @classmethod
    def level_range(cls, v):
        if v is not None and not (1 <= v <= 5):
            raise ValueError("Year level must be 1-5")
        return v

class CourseResponse(CourseBase):
    id: UUID

    class Config:
        from_attributes = True

# ============================================================================
# US-G.5 — AI Onboarding Course Suggestions
# ============================================================================

class OnboardingSuggestionRequest(BaseModel):
    program: str
    year: str

class OnboardingSuggestionResponse(BaseModel):
    courses: list[CourseResponse]
    note: Optional[str] = None

# ============================================================================

# Group Schemas
# ============================================================================

# Study terms: F25 (Fall), W26 (Winter), SU26 (Summer), Y25 (full year).
SESSION_RE = re.compile(r"^(F|W|SU|Y)\d{2}$")

def normalize_session(v: str) -> str:
    v = re.sub(r"\s+", "", (v or "").upper())
    if not SESSION_RE.match(v):
        raise ValueError("Session must look like F25, W26, SU26, or Y25")
    return v

class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_public: bool = True
    intended_major: Optional[str] = None
    # Term + section the group studies in, e.g. session "SU26", section "A".
    session: Optional[str] = None
    section: Optional[str] = None

    @field_validator("session")
    @classmethod
    def valid_session(cls, v):
        if v is None or v == "":
            return None
        return normalize_session(v)

    @field_validator("section")
    @classmethod
    def section_reasonable(cls, v):
        if v is None or v == "":
            return None
        v = v.strip().upper()
        if len(v) > 20:
            raise ValueError("Section must be at most 20 characters")
        return v

class GroupCreate(GroupBase):
    course_ids: Optional[List[UUID]] = []

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    intended_major: Optional[str] = None
    session: Optional[str] = None
    section: Optional[str] = None
    course_ids: Optional[List[UUID]] = None

    @field_validator("session")
    @classmethod
    def valid_session(cls, v):
        if v is None or v == "":
            return v
        return normalize_session(v)

class GroupOwnershipTransfer(BaseModel):
    new_owner_id: UUID

class GroupResponse(GroupBase):
    id: UUID
    created_by: UUID
    created_at: UTCDatetime

    class Config:
        from_attributes = True

class GroupDetailResponse(GroupResponse):
    member_count: int = 0
    course_codes: List[str] = []
    courses: List[CourseResponse] = []

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
    scheduled_at: UTCDatetime
    location: Optional[str] = None
    description: Optional[str] = None

class StudySessionCreate(StudySessionBase):
    pass

class StudySessionUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[UTCDatetime] = None
    location: Optional[str] = None
    description: Optional[str] = None

class StudySessionResponse(StudySessionBase):
    id: UUID
    group_id: UUID
    created_by: UUID
    created_at: UTCDatetime
    is_cancelled: bool = False

    class Config:
        from_attributes = True

class SessionRSVPCreate(BaseModel):
    status: str = "attending"

class SessionRSVPResponse(BaseModel):
    id: UUID
    session_id: UUID
    user_id: UUID
    status: str
    created_at: UTCDatetime

    class Config:
        from_attributes = True

class StudySessionDetailResponse(StudySessionResponse):
    attendees: List[SessionRSVPResponse] = []

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
    created_at: UTCDatetime

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
# Notification Schemas (US-E.1 @author: Ahmed)
# ============================================================================

class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    group_id: Optional[UUID] = None
    type: str
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool
    created_at: UTCDatetime
    metadata: Optional[Dict[str, Any]] = None

class UnreadCountResponse(BaseModel):
    unread_count: int

# ============================================================================
# Announcement Schemas (US-E.2 @author: Ahmed)
# ============================================================================

class AnnouncementCreate(BaseModel):
    title: str
    message: str
    is_pinned: bool = False

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    is_pinned: Optional[bool] = None

class AnnouncementResponse(BaseModel):
    id: UUID
    group_id: UUID
    author_id: UUID
    author_name: str
    title: str
    message: str
    is_pinned: bool
    created_at: UTCDatetime
    updated_at: UTCDatetime

# ============================================================================
# Task Schemas (US-E.3 @author: Ahmed)
# ============================================================================

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[UTCDatetime] = None
    priority: str = "medium"
    assigned_to: UUID

    _coerce_due = field_validator("due_date", mode="before")(_coerce_date_only)

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[UTCDatetime] = None
    priority: Optional[str] = None
    assigned_to: Optional[UUID] = None
    status: Optional[str] = None

    _coerce_due = field_validator("due_date", mode="before")(_coerce_date_only)

class TaskStatusUpdate(BaseModel):
    status: str

# ============================================================================
# Notification Preference Schemas (US-E.5 @author: Ahmed)
# ============================================================================

class NotificationPreferencesResponse(BaseModel):
    sessions: bool
    announcements: bool
    tasks: bool
    resources: bool
    group_activity: bool

class NotificationPreferencesUpdate(BaseModel):
    sessions: Optional[bool] = None
    announcements: Optional[bool] = None
    tasks: Optional[bool] = None
    resources: Optional[bool] = None
    group_activity: Optional[bool] = None

class TaskResponse(BaseModel):
    id: UUID
    group_id: UUID
    group_name: str
    assigned_by: UUID
    assigned_by_name: str
    assigned_to: UUID
    assigned_to_name: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    due_date: Optional[UTCDatetime] = None
    created_at: UTCDatetime
    updated_at: UTCDatetime
    completed_at: Optional[UTCDatetime] = None

# ============================================================================
# Error Schemas
# ============================================================================

class ErrorResponse(BaseModel):
    detail: str
    status_code: int

# ============================================================================
# Course Request Schemas (Courses tab -> request -> admin approve/reject)
# ============================================================================

class CourseRequestCreate(BaseModel):
    course_code: str
    course_name: str
    department: str
    reason: Optional[str] = None

    @field_validator("course_code")
    @classmethod
    def valid_york_code(cls, v: str) -> str:
        return normalize_york_course_code(v)

    @field_validator("course_name")
    @classmethod
    def name_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not (1 <= len(v) <= 255):
            raise ValueError("Course name must be 1-255 characters")
        return v

class CourseRequestResolve(BaseModel):
    admin_note: Optional[str] = None

class CourseRequestResponse(BaseModel):
    id: UUID
    requested_by: UUID
    requester_name: str = ""
    course_code: str
    course_name: str
    department: str
    status: str
    reason: Optional[str] = None
    admin_note: Optional[str] = None
    created_at: UTCDatetime
    resolved_at: Optional[UTCDatetime] = None

# ============================================================================
# Social Feed Schemas (dashboard)
# ============================================================================

class PostCreate(BaseModel):
    content: str
    group_id: Optional[UUID] = None

    @field_validator("content")
    @classmethod
    def content_reasonable(cls, v: str) -> str:
        v = (v or "").strip()
        if not (1 <= len(v) <= 4000):
            raise ValueError("Post must be 1-4000 characters")
        return v

class CommentCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_reasonable(cls, v: str) -> str:
        v = (v or "").strip()
        if not (1 <= len(v) <= 2000):
            raise ValueError("Comment must be 1-2000 characters")
        return v

class CommentResponse(BaseModel):
    id: UUID
    post_id: UUID
    author_id: UUID
    author_name: str
    content: str
    created_at: UTCDatetime

class PostResponse(BaseModel):
    id: UUID
    author_id: UUID
    author_name: str
    author_group: Optional[str] = None   # "which group the user is from"
    group_id: Optional[UUID] = None
    group_name: Optional[str] = None     # group the post was tagged with
    content: str
    created_at: UTCDatetime
    like_count: int = 0
    comment_count: int = 0
    liked_by_me: bool = False
    is_mine: bool = False

class FriendSummary(BaseModel):
    id: UUID
    name: str
    major: Optional[str] = None

# ============================================================================
# AI Study Assistant (Resources tab)
# ============================================================================

class AiTutorMessage(BaseModel):
    role: str      # "user" | "assistant"
    content: str

class AiTutorRequest(BaseModel):
    messages: List[AiTutorMessage]
    mode: str = "chat"   # "chat" | "quiz"

class AiTutorResponse(BaseModel):
    reply: str
    note: Optional[str] = None
