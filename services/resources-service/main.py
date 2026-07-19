"""
services/resources-service/main.py
Resources Service - upload and manage study materials.
Runs on port 8005
"""
from uuid import uuid4, UUID
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session

import sys
sys.path.append("/shared")
from shared_models import Resource, Group, GroupMembership, GroupMembershipRole, Base
from shared_database import engine, get_db
from shared_auth import get_current_user
from shared_schemas import ResourceResponse

def init_db():
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    print("📁 Resources Service starting...")
    init_db()
    yield
    print("🛑 Resources Service shutting down...")

app = FastAPI(title="StudySync Resources Service", version="1.0.0", lifespan=lifespan)

@app.get("/resources/health")
async def health():
    return {"status": "ok", "service": "resources-service"}

@app.get("/groups/{group_id}/resources", response_model=list[ResourceResponse])
async def list_resources(group_id: UUID, db: Session = Depends(get_db),
                         current_user: dict = Depends(get_current_user)):
    """List all resources in a group."""
    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    if not membership and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not a member of this group")

    return (db.query(Resource)
              .filter(Resource.group_id == group_id)
              .order_by(Resource.created_at.desc()).all())

@app.post("/groups/{group_id}/resources", response_model=ResourceResponse, status_code=201)
async def create_resource(group_id: str, file_name: str, file_url: str, file_type: str,
                          db: Session = Depends(get_db),
                          current_user: dict = Depends(get_current_user)):
    """
    Register an uploaded resource's metadata.
    (Actual file upload to Supabase happens on the frontend; this saves metadata.)
    """
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    if not membership and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only group members can upload resources")

    new_resource = Resource(
        id=uuid4(),
        group_id=group_id,
        uploaded_by=current_user["user_id"],
        file_name=file_name,
        file_url=file_url,
        file_type=file_type,
    )
    db.add(new_resource)
    db.commit()
    db.refresh(new_resource)
    return new_resource

@app.get("/resources/{resource_id}", response_model=ResourceResponse)
async def get_resource(resource_id: UUID, db: Session = Depends(get_db),
                       current_user: dict = Depends(get_current_user)):
    """Get a single resource by ID."""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == resource.group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    if not membership and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not a member of this group")

    return resource

@app.delete("/resources/{resource_id}", status_code=204)
async def delete_resource(resource_id: str, db: Session = Depends(get_db),
                          current_user: dict = Depends(get_current_user)):
    """Delete a resource (uploader, group leader, or admin)."""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")

    is_uploader = str(resource.uploaded_by) == str(current_user["user_id"])
    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == resource.group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    is_leader = membership and membership.role == GroupMembershipRole.LEADER
    if not (is_uploader or is_leader or current_user.get("role") == "admin"):
        raise HTTPException(status_code=403, detail="Not allowed to delete this resource")

    db.delete(resource)
    db.commit()
    return None

# US-G.3 @author: Uzma Alam
@app.post("/groups/{group_id}/resources/ask")
async def ask_library(
    group_id: str,
    question: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Answer a natural-language question using group resource metadata."""
    import os, httpx

    # Verify membership
    membership = (db.query(GroupMembership)
                    .filter(GroupMembership.group_id == group_id,
                            GroupMembership.user_id == current_user["user_id"])
                    .first())
    if not membership and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not a member of this group")

    # Get all resources for the group
    resources = (db.query(Resource)
                   .filter(Resource.group_id == group_id)
                   .order_by(Resource.created_at.desc()).all())

    if not resources:
        return {
            "answer": "No resources found in this group yet.",
            "sources": [],
        }

    # Build context from resource metadata
    context = "\n".join([
        f"- {r.file_name} ({r.file_type}) uploaded on {r.created_at.strftime('%Y-%m-%d')} — URL: {r.file_url}"
        for r in resources
    ])

    prompt = f"""You are a study assistant helping students find resources in their group library.

Available resources:
{context}

Student question: {question}

Answer the question based on the available resources. If relevant files exist, mention them by name and say they can be downloaded. Keep your answer concise please."""

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        # simple keyword search
        keywords = question.lower().split()
        matches = [r for r in resources if any(k in r.file_name.lower() for k in keywords)]
        return {
            "answer": f"Found {len(matches)} file(s) related to your question." if matches else "No matching files found.",
            "sources": [{"file_name": r.file_name, "file_url": r.file_url, "file_type": r.file_type} for r in matches],
        }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
            },
            timeout=15.0,
        )

    if response.status_code != 200:
        answer = "Could not generate an answer at this time."
    else:
        answer = response.json()["choices"][0]["message"]["content"].strip()

    # Find relevant sources based on keyword matching
    keywords = question.lower().split()
    sources = [
        {"file_name": r.file_name, "file_url": r.file_url, "file_type": r.file_type}
        for r in resources
        if any(k in r.file_name.lower() for k in keywords)
    ]

    return {"answer": answer, "sources": sources}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
