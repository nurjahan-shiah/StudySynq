"""
shared/models.py
SQLAlchemy ORM models used across all microservices.
Single source of truth for database schema.
"""

from datetime import datetime
from uuid import uuid4
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship
import enum

Base = declarative_base()

# ============================================================================
# Enums
# ============================================================================

class UserRole(str, enum.Enum):
    STUDENT = "student"
    GROUP_LEADER = "group_leader"
    ADMIN = "admin"

class GroupMembershipRole(str, enum.Enum):
    MEMBER = "member"
    LEADER = "leader"

# ============================================================================
# Core Entities
# ============================================================================

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.STUDENT)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    groups_created = relationship("Group", back_populates="creator", foreign_keys="Group.created_by")
    group_memberships = relationship("GroupMembership", back_populates="user")
    enrollments = relationship("UserEnrollment", back_populates="user")
    sessions_created = relationship("StudySession", back_populates="creator", foreign_keys="StudySession.created_by")
    resources_uploaded = relationship("Resource", back_populates="uploader")
    recommendations = relationship("Recommendation", back_populates="user")

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
    location = Column(String(255))
    description = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    group = relationship("Group", back_populates="sessions")
    creator = relationship("User", back_populates="sessions_created", foreign_keys=[created_by])

class Resource(Base):
    __tablename__ = "resources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

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

    # Relationships
    user = relationship("User", back_populates="recommendations")
    group = relationship("Group", back_populates="recommendations")