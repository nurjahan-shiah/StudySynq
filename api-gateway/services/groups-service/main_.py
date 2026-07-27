"""
services/groups-service/main.py
Groups Service  — Ali Shandhor (US-B.1, US-B.2, US-B.3, US-B.4)
- List / search / filter groups by course            (US-B.1)
- One-click join, duplicate prevention, leave        (US-B.2)
- Group creation wizard                              (US-B.3)
- Leader management: remove members, update group    (US-B.4)
- Group detail hub                                   (US-B.5)

Runs on port 8003
"""

from uuid import uuid4, UUID
from fastapi import FastAPI, HTTPException, Query, status, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from contextlib import asynccontextmanager

import sys
sys.path.append("/shared")
from shared_models import (
    Group, GroupMembership, GroupMembershipRole,
    GroupCourse, Course, User, Base
)
from shared_database import SessionLocal, engine, get_db
from shared_auth import get_current_user
from shared_schemas import (
    GroupCreate, GroupResponse, GroupDetailResponse,
    GroupUpdate, GroupMemberResponse
)

# ── DB init ──────────────────────────────────────────────────────────────────

def init_db():
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    print("👥 Groups Service starting...")
    init_db()
    yield
    print("🛑 Groups Service shutting down...")

app = FastAPI(
    title="StudySync Groups Service",
    description="Study group management — Ali Shandhor",
    version="1.0.0",
    lifespan=lifespan,
)

# ── helpers ───────────────────────────────────────────────────────────────────

def _member_count(db: Session, group_id) -> int:
    return db.query(GroupMembership).filter(GroupMembership.group_id == group_id).count()

def _course_codes(db: Session, group_id) -> List[str]:
    gcs = db.query(GroupCourse).filter(GroupCourse.group_id == group_id).all()
    codes = []
    for gc in gcs:
        c = db.query(Course).filter(Course.id == gc.course_id).first()
        if c:
            codes.append(c.course_code)
    return codes

def _to_detail(db: Session, g: Group) -> GroupDetailResponse:
    return GroupDetailResponse(
        id=g.id,
        name=g.name,
        description=g.description,
        is_public=g.is_public,
        created_by=g.created_by,
        created_at=g.created_at,
        member_count=_member_count(db, g.id),
        course_codes=_course_codes(db, g.id),
    )

# ── health ────────────────────────────────────────────────────────────────────

@app.get("/groups/health")
async def health():
    return {"status": "ok", "service": "groups-service"}

# ── US-B.1  List / search / filter groups ─────────────────────────────────────

@app.get("/groups", response_model=List[GroupDetailResponse])
async def list_groups(
    course_code: Optional[str] = Query(None, description="Filter by course code, e.g. EECS3311"),
    search: Optional[str]      = Query(None, description="Search group name"),
    sort_by: Optional[str]     = Query("created_at", description="created_at | member_count"),
    page: int                  = Query(1, ge=1),
    page_size: int             = Query(20, ge=1, le=100),
    db: Session                = Depends(get_db),
    current_user               = Depends(get_current_user),
):
    """
    US-B.1 — Searchable, filterable directory of study groups.
    Filter by course_code, search by name, sort, paginate.
    """
    query = db.query(Group).filter(Group.is_public == True)

    # Filter by course code
    if course_code:
        course = db.query(Course).filter(
            Course.course_code.ilike(f"%{course_code}%")
        ).first()
        if course:
            group_ids = [
                gc.group_id for gc in
                db.query(GroupCourse).filter(GroupCourse.course_id == course.id).all()
            ]
            query = query.filter(Group.id.in_(group_ids))
        else:
            return []  # No matching course → empty list

    # Search by name
    if search:
        query = query.filter(Group.name.ilike(f"%{search}%"))

    groups = query.all()

    # Build response objects (needed for member_count sort)
    results = [_to_detail(db, g) for g in groups]

    # Sort
    if sort_by == "member_count":
        results.sort(key=lambda g: g.member_count, reverse=True)
    else:
        results.sort(key=lambda g: g.created_at, reverse=True)

    # Paginate
    offset = (page - 1) * page_size
    return results[offset: offset + page_size]


# ── US-B.3  Create group ──────────────────────────────────────────────────────

@app.post("/groups", response_model=GroupDetailResponse, status_code=201)
async def create_group(
    group_data: GroupCreate,
    db: Session    = Depends(get_db),
    current_user   = Depends(get_current_user),
):
    """
    US-B.3 — Create a new study group.
    Creator automatically becomes group leader.
    Linked course IDs are validated and attached.
    """
    new_group = Group(
        id=uuid4(),
        name=group_data.name,
        description=group_data.description,
        created_by=current_user["user_id"],
        is_public=group_data.is_public,
    )
    db.add(new_group)
    db.flush()

    # Creator → leader
    db.add(GroupMembership(
        user_id=current_user["user_id"],
        group_id=new_group.id,
        role=GroupMembershipRole.LEADER,
    ))

    # Attach courses
    for course_id in group_data.course_ids or []:
        course = db.query(Course).filter(Course.id == course_id).first()
        if course:
            db.add(GroupCourse(group_id=new_group.id, course_id=course_id))

    db.commit()
    db.refresh(new_group)
    return _to_detail(db, new_group)


# ── US-B.5  Get group detail ──────────────────────────────────────────────────

@app.get("/groups/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """US-B.5 — Full group detail with member count and course codes."""
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return _to_detail(db, g)


# ── US-B.4  Update group ──────────────────────────────────────────────────────

@app.put("/groups/{group_id}", response_model=GroupDetailResponse)
async def update_group(
    group_id: UUID,
    group_data: GroupUpdate,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """US-B.4 — Only group leader or admin can update group details."""
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

    membership = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.user_id == current_user["user_id"],
    ).first()
    if not (membership and membership.role == GroupMembershipRole.LEADER) and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only group leader can update group")

    if group_data.name is not None:        g.name        = group_data.name
    if group_data.description is not None: g.description = group_data.description
    if group_data.is_public is not None:   g.is_public   = group_data.is_public

    db.commit()
    db.refresh(g)
    return _to_detail(db, g)


# ── US-B.4  Delete group ──────────────────────────────────────────────────────

@app.delete("/groups/{group_id}")
async def delete_group(
    group_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """US-B.4 — Only group creator or admin can delete."""
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    if str(g.created_by) != str(current_user["user_id"]) and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only group creator can delete group")
    db.delete(g)
    db.commit()
    return {"status": "deleted"}


# ── US-B.2  Join group ────────────────────────────────────────────────────────

@app.post("/groups/{group_id}/join")
async def join_group(
    group_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    US-B.2 — One-click join.
    Prevents duplicate membership and returns updated member count.
    """
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

    existing = db.query(GroupMembership).filter(
        GroupMembership.user_id  == current_user["user_id"],
        GroupMembership.group_id == group_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already a member of this group")

    db.add(GroupMembership(
        user_id=current_user["user_id"],
        group_id=group_id,
        role=GroupMembershipRole.MEMBER,
    ))
    db.commit()

    member_count = _member_count(db, group_id)
    return {"status": "joined", "member_count": member_count}


# ── US-B.2  Leave group ───────────────────────────────────────────────────────

@app.delete("/groups/{group_id}/leave")
async def leave_group(
    group_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """US-B.2 — Leave a group (leaders cannot leave their own group)."""
    membership = db.query(GroupMembership).filter(
        GroupMembership.user_id  == current_user["user_id"],
        GroupMembership.group_id == group_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Not a member of this group")
    if membership.role == GroupMembershipRole.LEADER:
        raise HTTPException(status_code=400, detail="Group leader cannot leave — delete the group or transfer leadership first")

    db.delete(membership)
    db.commit()
    return {"status": "left", "member_count": _member_count(db, group_id)}


# ── US-B.4  List members ──────────────────────────────────────────────────────

@app.get("/groups/{group_id}/members", response_model=List[GroupMemberResponse])
async def list_group_members(
    group_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """US-B.4 — Full member roster with roles."""
    if not db.query(Group).filter(Group.id == group_id).first():
        raise HTTPException(status_code=404, detail="Group not found")

    memberships = db.query(GroupMembership).filter(GroupMembership.group_id == group_id).all()
    result = []
    for m in memberships:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            result.append(GroupMemberResponse(
                user_id=u.id,
                user_name=u.name,
                user_email=u.email,
                membership_role=m.role.value,
            ))
    return result


# ── US-B.4  Remove a member (leader only) ────────────────────────────────────

@app.delete("/groups/{group_id}/members/{user_id}")
async def remove_member(
    group_id: UUID,
    user_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    US-B.4 — Group leader can remove any member except themselves.
    Admin can remove anyone.
    """
    # Caller must be leader or admin
    caller_membership = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.user_id  == current_user["user_id"],
    ).first()
    is_leader = caller_membership and caller_membership.role == GroupMembershipRole.LEADER
    is_admin  = current_user["role"] == "admin"
    if not (is_leader or is_admin):
        raise HTTPException(status_code=403, detail="Only group leader can remove members")

    # Leader cannot remove themselves
    if str(user_id) == str(current_user["user_id"]):
        raise HTTPException(status_code=400, detail="Leader cannot remove themselves")

    target = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.user_id  == user_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this group")

    db.delete(target)
    db.commit()
    return {"status": "removed", "member_count": _member_count(db, group_id)}


# ── US-B.2  Check membership ──────────────────────────────────────────────────

@app.get("/groups/{group_id}/membership")
async def check_membership(
    group_id: UUID,
    db: Session  = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Returns membership status of the current user for a group."""
    membership = db.query(GroupMembership).filter(
        GroupMembership.group_id == group_id,
        GroupMembership.user_id  == current_user["user_id"],
    ).first()
    if not membership:
        return {"is_member": False, "role": None}
    return {"is_member": True, "role": membership.role.value}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
