"""
services/recommendations-service/main.py
Recommendations Service - serve study-group recommendations.
Reads precomputed scores from the recommendations table (written by the ETL/ML pipeline).
Runs on port 8008
"""
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session

import sys
sys.path.append("/shared")
from shared_models import Recommendation, Group, UserEnrollment, GroupCourse, Base
from shared_database import engine, get_db
from shared_auth import get_current_user

def init_db():
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    print("🤖 Recommendations Service starting...")
    init_db()
    yield
    print("🛑 Recommendations Service shutting down...")

app = FastAPI(title="StudySync Recommendations Service", version="1.0.0", lifespan=lifespan)

@app.get("/recommendations/health")
async def health():
    return {"status": "ok", "service": "recommendations-service"}

@app.get("/recommendations")
async def get_recommendations(db: Session = Depends(get_db),
                              current_user: dict = Depends(get_current_user)):
    """
    Return ranked group recommendations for the current user.
    If the ML pipeline has written scores, use them. Otherwise fall back to a
    simple live course-overlap computation so the endpoint always returns data.
    """
    user_id = current_user["user_id"]

    # 1. Try precomputed recommendations first
    recs = (db.query(Recommendation)
              .filter(Recommendation.user_id == user_id)
              .order_by(Recommendation.score.desc())
              .limit(10).all())
    if recs:
        results = []
        for r in recs:
            group = db.query(Group).filter(Group.id == r.group_id).first()
            if group:
                results.append({
                    "group_id": str(group.id),
                    "name": group.name,
                    "score": r.score,
                })
        return {"recommendations": results, "source": "ml_pipeline"}

    # 2. Fallback: live course-overlap scoring
    user_courses = {e.course_id for e in
                    db.query(UserEnrollment).filter(UserEnrollment.user_id == user_id).all()}
    if not user_courses:
        return {"recommendations": [], "source": "fallback"}

    scored = []
    for group in db.query(Group).all():
        group_courses = {gc.course_id for gc in
                         db.query(GroupCourse).filter(GroupCourse.group_id == group.id).all()}
        overlap = len(user_courses & group_courses)
        if overlap > 0:
            scored.append({
                "group_id": str(group.id),
                "name": group.name,
                "score": min(overlap * 50, 100),
            })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return {"recommendations": scored[:10], "source": "fallback"}

# US-G.1 @author: Uzma Alam
@app.get("/recommendations/{group_id}/explain")
async def explain_recommendation(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a natural-language explanation of why a group is a good match."""
    import os, httpx

    user_id = current_user["user_id"]

    # Get user's courses
    user_courses = {e.course_id for e in
                    db.query(UserEnrollment).filter(UserEnrollment.user_id == user_id).all()}

    # Get group info
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Get group's courses
    group_courses = {gc.course_id for gc in
                     db.query(GroupCourse).filter(GroupCourse.group_id == group_id).all()}

    # Calculate overlap
    overlap = user_courses & group_courses
    overlap_count = len(overlap)

    # Get precomputed score if available
    rec = (db.query(Recommendation)
             .filter(Recommendation.user_id == user_id,
                     Recommendation.group_id == group_id)
             .first())
    score = rec.score if rec else overlap_count * 50

    # Build prompt
    prompt = f"""You are a study group recommendation assistant.
A student is considering joining the study group "{group.name}".
- Shared courses: {overlap_count}
- Match score: {score}/100
- Group description: {group.description or 'No description provided'}

Write a single short sentence (max 20 words) explaining why this group is a good match.
Start with 'This group'."""

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {
            "group_id": group_id,
            "group_name": group.name,
            "score": score,
            "explanation": f"This group shares {overlap_count} course(s) with you and has a match score of {score}/100.",
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
                "max_tokens": 60,
            },
            timeout=10.0,
        )

    if response.status_code != 200:
        explanation = f"This group shares {overlap_count} course(s) with you with a match score of {score}/100."
    else:
        explanation = response.json()["choices"][0]["message"]["content"].strip()

    return {
        "group_id": group_id,
        "group_name": group.name,
        "score": score,
        "explanation": explanation,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)
