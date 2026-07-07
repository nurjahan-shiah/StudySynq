"""
services/tasks-service/main.py
Task Assigning & Tracking service (US-E.3 @author: Ahmed).
Runs on port 8011.

Group leaders assign tasks to specific members; the assignee is notified through
the Notification Centre and can update the task's status. Announcements are
group-wide messages (US-E.2); tasks are per-member responsibilities.
"""
from uuid import uuid4, UUID
from datetime import datetime

from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session

import sys
sys.path.append("/shared")
from shared_models import Task, Group, GroupMembership, GroupMembershipRole, User, Base
from shared_database import engine, get_db
from shared_auth import get_current_user
from shared_schemas import TaskCreate, TaskUpdate, TaskStatusUpdate, TaskResponse
from shared_notifications import create_notification

VALID_STATUSES = {"todo", "in_progress", "completed"}
VALID_PRIORITIES = {"low", "medium", "high"}


def init_db():
    Base.metadata.create_all(bind=engine)


async def lifespan(app: FastAPI):
    print("✅ Tasks Service starting...")
    init_db()
    yield
    print("🛑 Tasks Service shutting down...")


app = FastAPI(title="StudySync Tasks Service", version="1.0.0", lifespan=lifespan)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _membership(db: Session, group_id, user_id):
    return (db.query(GroupMembership)
              .filter(GroupMembership.group_id == group_id,
                      GroupMembership.user_id == user_id)
              .first())


def _is_leader(db: Session, group_id, current_user) -> bool:
    if current_user.get("role") == "admin":
        return True
    m = _membership(db, group_id, current_user["user_id"])
    return bool(m and m.role == GroupMembershipRole.LEADER)


def _require_member(db: Session, group_id, current_user):
    if current_user.get("role") == "admin":
        return
    if not _membership(db, group_id, current_user["user_id"]):
        raise HTTPException(status_code=403, detail="Not a member of this group")


def _require_leader(db: Session, group_id, current_user):
    if not _is_leader(db, group_id, current_user):
        raise HTTPException(status_code=403, detail="Only group leaders can manage tasks")


def _name(db: Session, user_id) -> str:
    u = db.query(User).filter(User.id == user_id).first()
    return u.name if u else "Unknown"


def _to_response(db: Session, t: Task) -> TaskResponse:
    group = db.query(Group).filter(Group.id == t.group_id).first()
    return TaskResponse(
        id=t.id,
        group_id=t.group_id,
        group_name=group.name if group else "Unknown group",
        assigned_by=t.assigned_by,
        assigned_by_name=_name(db, t.assigned_by),
        assigned_to=t.assigned_to,
        assigned_to_name=_name(db, t.assigned_to),
        title=t.title,
        description=t.description,
        status=t.status,
        priority=t.priority,
        due_date=t.due_date,
        created_at=t.created_at,
        updated_at=t.updated_at,
        completed_at=t.completed_at,
    )


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------

@app.get("/tasks/health")
async def health():
    return {"status": "ok", "service": "tasks-service"}


@app.post("/groups/{group_id}/tasks", response_model=TaskResponse, status_code=201)
async def create_task(group_id: UUID, data: TaskCreate,
                      db: Session = Depends(get_db),
                      current_user: dict = Depends(get_current_user)):
    """Assign a task to a group member (group leader or admin only)."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_leader(db, group_id, current_user)

    if data.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Use: {sorted(VALID_PRIORITIES)}")

    # The assignee must be a member of this group.
    if not _membership(db, group_id, data.assigned_to):
        raise HTTPException(status_code=400, detail="Assignee must be a member of this group")

    task = Task(
        id=uuid4(),
        group_id=group_id,
        assigned_by=current_user["user_id"],
        assigned_to=data.assigned_to,
        title=data.title,
        description=data.description,
        status="todo",
        priority=data.priority,
        due_date=data.due_date,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # US-E.3 → US-E.1: notify the assignee that a task was assigned to them. Tasks are
    # personal responsibilities, so we notify even when a leader assigns one to themselves.
    try:
        due = f" (due {task.due_date:%b %d})" if task.due_date else ""
        create_notification(
            db,
            user_id=data.assigned_to,
            type="task",
            title=f"New task assigned: {data.title}",
            message=f"{group.name}{due}",
            link="/tasks",
            group_id=group_id,
            meta={"task_id": str(task.id), "group_id": str(group_id)},
        )
    except Exception as e:  # pragma: no cover - notifications are best-effort
        print(f"[tasks-service] failed to create task notification: {e}")

    return _to_response(db, task)


@app.get("/groups/{group_id}/tasks", response_model=list[TaskResponse])
async def list_group_tasks(group_id: UUID, db: Session = Depends(get_db),
                           current_user: dict = Depends(get_current_user)):
    """List all tasks for a group (any member of the group, or admin)."""
    _require_member(db, group_id, current_user)
    rows = (db.query(Task)
              .filter(Task.group_id == group_id)
              .order_by(Task.created_at.desc())
              .all())
    return [_to_response(db, t) for t in rows]


@app.get("/tasks/user/{user_id}", response_model=list[TaskResponse])
async def list_user_tasks(user_id: UUID, db: Session = Depends(get_db),
                          current_user: dict = Depends(get_current_user)):
    """List tasks assigned to a user (the user themselves, or admin)."""
    if str(user_id) != str(current_user["user_id"]) and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to view these tasks")
    rows = (db.query(Task)
              .filter(Task.assigned_to == user_id)
              .order_by(Task.created_at.desc())
              .all())
    return [_to_response(db, t) for t in rows]


@app.patch("/tasks/{task_id}/status", response_model=TaskResponse)
async def update_task_status(task_id: UUID, data: TaskStatusUpdate,
                             db: Session = Depends(get_db),
                             current_user: dict = Depends(get_current_user)):
    """Update a task's status (the assignee, that group's leader, or admin)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    is_assignee = str(task.assigned_to) == str(current_user["user_id"])
    if not (is_assignee or _is_leader(db, task.group_id, current_user)):
        raise HTTPException(status_code=403, detail="Not allowed to update this task")

    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Use: {sorted(VALID_STATUSES)}")

    task.status = data.status
    task.completed_at = datetime.utcnow() if data.status == "completed" else None
    db.commit()
    db.refresh(task)
    return _to_response(db, task)


@app.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: UUID, data: TaskUpdate,
                      db: Session = Depends(get_db),
                      current_user: dict = Depends(get_current_user)):
    """Edit a task (group leader or admin only)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _require_leader(db, task.group_id, current_user)

    fields = data.dict(exclude_unset=True)
    if "priority" in fields and fields["priority"] not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Use: {sorted(VALID_PRIORITIES)}")
    if "status" in fields and fields["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Use: {sorted(VALID_STATUSES)}")
    if "assigned_to" in fields and not _membership(db, task.group_id, fields["assigned_to"]):
        raise HTTPException(status_code=400, detail="Assignee must be a member of this group")

    for field, value in fields.items():
        setattr(task, field, value)
    if "status" in fields:
        task.completed_at = datetime.utcnow() if fields["status"] == "completed" else None
    db.commit()
    db.refresh(task)
    return _to_response(db, task)


@app.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: UUID, db: Session = Depends(get_db),
                      current_user: dict = Depends(get_current_user)):
    """Delete a task (group leader or admin only)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _require_leader(db, task.group_id, current_user)

    db.delete(task)
    db.commit()
    return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8011)
