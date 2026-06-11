"""
services/groups-service/main.py
Groups Service
- List public groups
- Create new group
- Get group details
- Update group
- Delete group
- Join/leave group
- List group members

Runs on port 8003
"""

from uuid import uuid4, UUID
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager

# Import shared utilities
import sys
sys.path.append("/shared")
from shared_models import Group, GroupMembership, GroupMembershipRole, GroupCourse, Course, User, Base
from shared_database import SessionLocal, engine, get_db
from shared_auth import get_current_user
from shared_schemas import GroupCreate, GroupResponse, GroupDetailResponse, GroupUpdate, GroupMemberResponse

# ============================================================================
# Initialize Database
# ============================================================================

def init_db():
    """Create tables if they don't exist."""
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    print("👥 Groups Service starting...")
    init_db()
    yield
    print("🛑 Groups Service shutting down...")

app = FastAPI(
    title="StudySync Groups Service",
    description="Study group management",
    version="1.0.0",
    lifespan=lifespan
)

# ============================================================================
# Routes
# ============================================================================

@app.get("/groups/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "groups-service"}

@app.get("/groups", response_model=List[GroupResponse])
async def list_groups(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all public groups.
    Only authenticated users can list groups.
    """
    groups = db.query(Group).filter(Group.is_public == True).all()
    
    return [
        GroupResponse(
            id=g.id,
            name=g.name,
            description=g.description,
            is_public=g.is_public,
            created_by=g.created_by,
            created_at=g.created_at
        )
        for g in groups
    ]

@app.post("/groups", response_model=GroupResponse)
async def create_group(
    group_data: GroupCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a new study group.
    Authenticated users can create groups.
    Creator automatically becomes group leader.
    """
    new_group = Group(
        id=uuid4(),
        name=group_data.name,
        description=group_data.description,
        created_by=current_user["user_id"],
        is_public=group_data.is_public
    )
    
    db.add(new_group)
    db.flush()  # Get the group ID
    
    # Add creator as group leader
    membership = GroupMembership(
        user_id=current_user["user_id"],
        group_id=new_group.id,
        role=GroupMembershipRole.LEADER
    )
    db.add(membership)
    
    # Add courses to group
    for course_id in group_data.course_ids or []:
        course = db.query(Course).filter(Course.id == course_id).first()
        if course:
            group_course = GroupCourse(
                group_id=new_group.id,
                course_id=course_id
            )
            db.add(group_course)
    
    db.commit()
    db.refresh(new_group)
    
    return GroupResponse(
        id=new_group.id,
        name=new_group.name,
        description=new_group.description,
        is_public=new_group.is_public,
        created_by=new_group.created_by,
        created_at=new_group.created_at
    )

@app.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get detailed information about a group.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Count members
    member_count = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id
    ).count()
    
    # Get course codes
    group_courses = db.query(GroupCourse).filter(
        GroupCourse.group_id == group_id
    ).all()
    course_codes = []
    for gc in group_courses:
        course = db.query(Course).filter(Course.id == gc.course_id).first()
        if course:
            course_codes.append(course.course_code)
    
    return GroupDetailResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_public=group.is_public,
        created_by=group.created_by,
        created_at=group.created_at,
        member_count=member_count,
        course_codes=course_codes
    )

@app.put("/groups/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: UUID,
    group_data: GroupUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update group information.
    Only group leader or admin can update.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Check authorization: must be group leader or admin
    membership = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.user_id == current_user["user_id"]
    ).first()
    
    is_leader = membership and membership.role == GroupMembershipRole.LEADER
    is_admin = current_user["role"] == "admin"
    
    if not (is_leader or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group leader can update group"
        )
    
    # Update fields
    if group_data.name:
        group.name = group_data.name
    if group_data.description is not None:
        group.description = group_data.description
    if group_data.is_public is not None:
        group.is_public = group_data.is_public
    
    db.commit()
    db.refresh(group)
    
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_public=group.is_public,
        created_by=group.created_by,
        created_at=group.created_at
    )

@app.delete("/groups/{group_id}")
async def delete_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Delete a group.
    Only group leader or admin can delete.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Authorization check
    is_leader = group.created_by == current_user["user_id"]
    is_admin = current_user["role"] == "admin"
    
    if not (is_leader or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group creator can delete group"
        )
    
    db.delete(group)
    db.commit()
    
    return {"status": "deleted"}

@app.post("/groups/{group_id}/join")
async def join_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Join a group as a member.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    # Check if already member
    existing = db.query(GroupMembership).filter(
        GroupMembership.user_id == current_user["user_id"],
        GroupMembership.group_id == group_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already a member of this group"
        )
    
    # Add as member
    membership = GroupMembership(
        user_id=current_user["user_id"],
        group_id=group_id,
        role=GroupMembershipRole.MEMBER
    )
    db.add(membership)
    db.commit()
    
    return {"status": "joined"}

@app.delete("/groups/{group_id}/leave")
async def leave_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Leave a group.
    """
    membership = db.query(GroupMembership).filter(
        GroupMembership.user_id == current_user["user_id"],
        GroupMembership.group_id == group_id
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not a member of this group"
        )
    
    db.delete(membership)
    db.commit()
    
    return {"status": "left"}

@app.get("/groups/{group_id}/members", response_model=List[GroupMemberResponse])
async def list_group_members(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all members of a group.
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found"
        )
    
    memberships = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id
    ).all()
    
    members = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            members.append(GroupMemberResponse(
                user_id=user.id,
                user_name=user.name,
                user_email=user.email,
                membership_role=m.role.value
            ))
    
    return members

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)