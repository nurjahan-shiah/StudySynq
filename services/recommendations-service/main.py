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
from shared_models import (
    Recommendation, Group, GroupMembership, UserEnrollment,
    GroupCourse, Course, Base
)
from shared_database import engine, get_db
from shared_auth import get_current_user

def init_db():
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    print("🤖 Recommendations Service starting...")
    init_db()
    yield
    print("🛑 Recommendations Service shutting down...")

app = FastAPI(title="StudySynq Recommendations Service", version="1.0.0", lifespan=lifespan)

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
    joined_group_ids = {
        membership.group_id
        for membership in db.query(GroupMembership).filter(
            GroupMembership.user_id == user_id
        ).all()
    }

    # 1. Try precomputed recommendations first
    recs = (db.query(Recommendation)
              .filter(Recommendation.user_id == user_id)
              .order_by(Recommendation.score.desc())
              .all())
    if recs:
        results = []
        for r in recs:
            group = db.query(Group).filter(Group.id == r.group_id).first()
            if (
                group
                and group.id not in joined_group_ids
                and str(group.created_by) != str(user_id)
                and group.is_public
                and not group.is_deleted
            ):
                results.append({
                    "group_id": str(group.id),
                    "name": group.name,
                    "score": r.score,
                })
                if len(results) == 10:
                    break
        return {"recommendations": results, "source": "ml_pipeline"}

    # 2. Fallback: live course-overlap scoring
    user_courses = {e.course_id for e in
                    db.query(UserEnrollment).filter(UserEnrollment.user_id == user_id).all()}
    if not user_courses:
        return {"recommendations": [], "source": "fallback"}

    scored = []
    for group in db.query(Group).filter(
        Group.is_public == True,
        Group.is_deleted == False
    ).all():
        if group.id in joined_group_ids or str(group.created_by) == str(user_id):
            continue
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
    shared_courses = []
    if overlap:
        shared_courses = [
            f"{course.course_code} — {course.course_name} ({course.department})"
            for course in (
                db.query(Course)
                .filter(Course.id.in_(overlap))
                .order_by(Course.course_code)
                .all()
            )
        ]

    # Get precomputed score if available
    rec = (db.query(Recommendation)
             .filter(Recommendation.user_id == user_id,
                     Recommendation.group_id == group_id)
             .first())
    score = rec.score if rec else overlap_count * 50

    # Build prompt
    shared_course_text = ", ".join(shared_courses) if shared_courses else "no named courses"
    fallback_explanation = (
        f"This group matches your courses: {shared_course_text}."
        if shared_courses
        else f"This group has a match score of {score}/100 based on your course activity."
    )

    prompt = f"""You are a study group recommendation assistant.
A student is considering joining the study group "{group.name}".
- Shared courses ({overlap_count}): {shared_course_text}
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
            "shared_courses": shared_courses,
            "explanation": fallback_explanation,
        }

    explanation = fallback_explanation
    try:
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
        if response.status_code == 200:
            explanation = response.json()["choices"][0]["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        # Explanations are an enhancement; course-based context should still
        # render when the external AI provider is unavailable or malformed.
        pass

    return {
        "group_id": group_id,
        "group_name": group.name,
        "score": score,
        "shared_courses": shared_courses,
        "explanation": explanation,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)
