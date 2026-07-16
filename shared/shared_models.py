"""
shared/models.py
SQLAlchemy ORM models used across all microservices.
Single source of truth for database schema.
"""

from datetime import datetime
from uuid import uuid4
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, relationship
import enum

Base = declarative_base()

# ============================================================================
# Enums
# ============================================================================

class UserRole(str, enum.Enum):
    STUDENT = "student"
    ADMIN = "admin"

class GroupMembershipRole(str, enum.Enum):
    MEMBER = "member"
    LEADER = "leader"

# US-E.1 @author: Ahmed — Notification Centre
class NotificationType(str, enum.Enum):
    SESSION = "session"
    ANNOUNCEMENT = "announcement"
    TASK = "task"
    RESOURCE = "resource"
    SYSTEM = "system"

# ============================================================================
# Core Entities
# ============================================================================

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, native_enum=False), default=UserRole.STUDENT)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    groups_created = relationship("Group", back_populates="creator", foreign_keys="Group.created_by")
    group_memberships = relationship("GroupMembership", back_populates="user")
    enrollments = relationship("UserEnrollment", back_populates="user")
    sessions_created = relationship("StudySession", back_populates="creator", foreign_keys="StudySession.created_by")
    resources_uploaded = relationship("Resource", back_populates="uploader")
    recommendations = relationship("Recommendation", back_populates="user")
    rsvps = relationship("SessionRSVP", back_populates="user")

class Course(Base):
    __tablename__ = "courses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    course_code = Column(String(50), unique=True, nullable=False, index=True)
    course_name = Column(String(255), nullable=False)
    department = Column(String(100), nullable=False)

    # Relationships
    group_courses = relationship("GroupCourse", back_populates="course")
    user_enrollments = relationship("UserEnrollment", back_populates="course")

class Group(Base):
    __tablename__ = "groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # US-F.2 moderation soft-delete
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(UUID(as_uuid=True), nullable=True)

    # Relationships
    creator = relationship("User", back_populates="groups_created", foreign_keys=[created_by])
    memberships = relationship("GroupMembership", back_populates="group", cascade="all, delete-orphan")
    group_courses = relationship("GroupCourse", back_populates="group", cascade="all, delete-orphan")
    sessions = relationship("StudySession", back_populates="group", cascade="all, delete-orphan")
    resources = relationship("Resource", back_populates="group", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="group", cascade="all, delete-orphan")

class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False)
    title = Column(String(255), nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=60)
    location = Column(String(255))
    description = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_cancelled    = Column(Boolean, default=False)

    # Relationships
    group = relationship("Group", back_populates="sessions")
    creator = relationship("User", back_populates="sessions_created", foreign_keys=[created_by])
    rsvps = relationship("SessionRSVP", back_populates="session")

class Resource(Base):
    __tablename__ = "resources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # US-F.2 moderation soft-delete
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(UUID(as_uuid=True), nullable=True)

    # Relationships
    group = relationship("Group", back_populates="resources")
    uploader = relationship("User", back_populates="resources_uploaded")

# ============================================================================
# Junction / Relationship Tables
# ============================================================================

class GroupMembership(Base):
    __tablename__ = "group_memberships"
    __table_args__ = (
        UniqueConstraint('user_id', 'group_id', name='unique_user_group'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False, index=True)
    role = Column(Enum(GroupMembershipRole), default=GroupMembershipRole.MEMBER)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="group_memberships")
    group = relationship("Group", back_populates="memberships")

class GroupCourse(Base):
    __tablename__ = "group_courses"
    __table_args__ = (
        UniqueConstraint('group_id', 'course_id', name='unique_group_course'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)

    # Relationships
    group = relationship("Group", back_populates="group_courses")
    course = relationship("Course", back_populates="group_courses")

class UserEnrollment(Base):
    __tablename__ = "user_enrollments"
    __table_args__ = (
        UniqueConstraint('user_id', 'course_id', name='unique_user_course'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="user_enrollments")

class SessionRSVPStatus(str, enum.Enum):
    ATTENDING = "attending"
    NOT_ATTENDING = "not_attending"
    MAYBE = "maybe"

class SessionRSVP(Base):
    __tablename__ = "session_rsvps"
    __table_args__ = (
        UniqueConstraint('session_id', 'user_id', name='unique_session_user_rsvp'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("study_sessions.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(Enum(SessionRSVPStatus), nullable=False, default=SessionRSVPStatus.ATTENDING)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("StudySession", back_populates="rsvps")
    user = relationship("User", back_populates="rsvps")

class Recommendation(Base):
    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint('user_id', 'group_id', name='unique_user_group_rec'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False, index=True)
    score = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_cancelled = Column(Boolean, default=False, nullable=False)

    # Relationships
    user = relationship("User", back_populates="recommendations")
    group = relationship("Group", back_populates="recommendations")

# ============================================================================
# Notifications (US-E.1 @author: Ahmed)
# ============================================================================

class Notification(Base):
    """A single notification delivered to one user.

    Rows are created by triggering services (e.g. Sessions) via the helpers in
    shared_notifications.py. The Notification Centre service exposes read /
    unread-count / mark-read endpoints over this table.
    """
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    # group_id is nullable: system notifications are not tied to a group
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=True, index=True)
    type = Column(String(50), nullable=False)  # NotificationType value
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    link = Column(String(500), nullable=True)  # where clicking the notification navigates
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    # NOTE: the column is named "metadata", but `metadata` is reserved on SQLAlchemy
    # declarative classes, so the Python attribute is `meta`.
    meta = Column("metadata", JSONB, nullable=True)

# ============================================================================
# Announcements (US-E.2 @author: Ahmed)
# ============================================================================

class Announcement(Base):
    """A group leader's announcement, shown in that group's Announcement Board.

    Creating one triggers notifications to all group members via
    shared_notifications.create_group_notifications. Pinned announcements sort
    to the top of the feed.
    """
    __tablename__ = "announcements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # US-F.2 moderation soft-delete
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(UUID(as_uuid=True), nullable=True)

# ============================================================================
# Tasks (US-E.3 @author: Ahmed)
# ============================================================================

class Task(Base):
    """A task a group leader assigns to a specific group member.

    Creating one triggers a single-user notification to the assignee via
    shared_notifications.create_notification. The assignee (or the group leader)
    can update its status; completing it stamps completed_at.
    """
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False, index=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="todo", nullable=False, index=True)   # todo | in_progress | completed
    priority = Column(String(10), default="medium", nullable=False)           # low | medium | high
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

# ============================================================================
# Notification Preferences (US-E.5 @author: Ahmed)
# ============================================================================

class NotificationPreference(Base):
    """One row per (user, notification category) that the user has changed from
    its default. Absence of a row means the category's default applies. Checked
    before a notification is created, so disabled categories are never delivered.
    """
    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint('user_id', 'notification_type', name='unique_user_notif_pref'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    # sessions | announcements | tasks | resources | group_activity
    notification_type = Column(String(30), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

