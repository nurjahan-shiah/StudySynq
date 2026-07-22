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
    # ── Profile (Complete your profile) ──────────────────────────────────────
    # New columns on an existing table: added at startup by
    # shared_database.run_light_migrations (create_all never ALTERs).
    major = Column(String(255), nullable=True)
    year_of_study = Column(String(20), nullable=True)   # "1st year" … "5th year+"
    bio = Column(Text, nullable=True)
    # Per-field visibility chosen by the user, e.g.
    # {"major": "public", "year_of_study": "public", "bio": "private", "email": "private"}
    profile_privacy = Column(JSONB, nullable=True)

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
    # Catalogue identifiers (added via light migration):
    faculty = Column(String(255), nullable=True)      # e.g. "Lassonde School of Engineering"
    year_level = Column(Integer, nullable=True)       # 1-4 (5 = graduate), derived from the code

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
    intended_major = Column(String(255), nullable=True)
    # Term the group studies in, e.g. "SU26", and its section, e.g. "A" / "M"
    # (added via light migration).
    session = Column(String(10), nullable=True)
    section = Column(String(20), nullable=True)
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
    # US-F.2 moderation soft-delete. Distinct from is_cancelled: a leader
    # cancels a session (members still see it, struck through), an admin
    # deletes it (nobody sees it).
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(UUID(as_uuid=True), nullable=True)

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
# ============================================================================
# Profile fields on User are added via light migration (shared_database.
# run_light_migrations) since create_all never alters existing tables.
# ============================================================================

# ============================================================================
# Course Requests (Courses tab: "request a course" -> admin approve/reject)
# ============================================================================

class CourseRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class CourseRequest(Base):
    """A student's request for a course that isn't in the catalogue yet.

    Creating one notifies every admin. When an admin approves it, the course is
    created and the requester is notified "request accepted"; on reject the
    requester is notified "request rejected".
    """
    __tablename__ = "course_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_code = Column(String(50), nullable=False, index=True)
    course_name = Column(String(255), nullable=False)
    department = Column(String(100), nullable=False)
    status = Column(String(20), default=CourseRequestStatus.PENDING.value, nullable=False, index=True)
    reason = Column(Text, nullable=True)          # optional note from the student
    admin_note = Column(Text, nullable=True)      # optional note on approve/reject
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(UUID(as_uuid=True), nullable=True)

# ============================================================================
# Social feed (dashboard): posts, comments, likes, friendships
# ============================================================================

class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    # Optional group tag: "posting from <group>"
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(UUID(as_uuid=True), nullable=True)

class PostComment(Base):
    __tablename__ = "post_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

class PostLike(Base):
    __tablename__ = "post_likes"
    __table_args__ = (
        UniqueConstraint('post_id', 'user_id', name='unique_post_like'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class FriendshipStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    BLOCKED = "blocked"

class Friendship(Base):
    """Directed friend request: requester -> addressee. Accepted = friends.

    A blocked row keeps the pair recorded but with status="blocked" and
    blocked_by set to whoever initiated it. Because the row is directed but a
    block is not, blocked_by is what tells the two sides apart: the blocker
    can undo it, the blocked user just sees nothing.
    """
    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint('requester_id', 'addressee_id', name='unique_friend_pair'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default=FriendshipStatus.PENDING.value, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    # Who performed the block (null unless status == "blocked").
    blocked_by = Column(UUID(as_uuid=True), nullable=True)
    blocked_at = Column(DateTime, nullable=True)

# ============================================================================
# Moderation audit trail (US-F.2)
# ============================================================================

class ModerationLog(Base):
    """Record of a content moderation action.

    Lives in shared/ rather than admin-service so that *any* service which
    soft-deletes content can append to the same audit trail. In particular a
    group leader deleting their own group writes here too, which is what
    makes that deletion visible — and therefore restorable — from the admin
    moderation console.

    `action` is "delete" or "restore". `admin_id` is whoever performed it,
    which is not necessarily an admin (a group leader deleting their own
    group is recorded with their own id and actor_role="leader").
    """
    __tablename__ = "moderation_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    admin_id = Column(UUID(as_uuid=True), nullable=False)
    entity_type = Column(String(20), nullable=False)   # group | resource | announcement | session
    entity_id = Column(String(255), nullable=False)
    action = Column(String(50), nullable=False, default="delete")
    reason = Column(Text, nullable=True)
    target_title = Column(String(255), nullable=True)
    # Distinguishes an admin moderating someone else's content from an owner
    # deleting their own. Nullable so pre-existing rows stay valid.
    actor_role = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)