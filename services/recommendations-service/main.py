"""
services/recommendations-service/main.py
Recommendations Service - serve study-group recommendations.
Reads precomputed scores from the recommendations table (written by the ETL/ML pipeline).
Runs on port 8008
"""
from datetime import datetime

from fastapi import FastAPI, HTTPException, status, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import sys
sys.path.append("/shared")
from shared_models import (
    Recommendation, Group, GroupMembership, UserEnrollment,
    GroupCourse, Course, User, StudySession, Base
)
from shared_database import engine, get_db, run_light_migrations
from shared_auth import get_current_user
from shared_time import iso_utc

def init_db():
    Base.metadata.create_all(bind=engine)
    run_light_migrations(engine)

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


# ── Recommended tab: groups matching the user's major (view only) ────────────

_YEAR_TO_LEVEL = {"1st year": 1, "2nd year": 2, "3rd year": 3, "4th year": 4, "5th year+": 4}


def _course_level(course_code: str) -> int | None:
    """First digit of the numeric part of a York code: 'EECS 4314' -> 4."""
    parts = course_code.split()
    if len(parts) == 2 and parts[1][:1].isdigit():
        return int(parts[1][0])
    return None


def _major_match_pct(user_major: str, group_major: str | None, year_match: bool) -> int:
    """
    Percentage match between the user's major and a group's intended major.

    Every open group is shown, scored by how relevant it is:
      - Exact major match      -> 95 base (105 -> capped 100 with the year bonus)
      - Related major          -> word overlap between the two major names,
        scaled into a 45-85 band, so "Computer Science" vs "Computer
        Engineering" reads as a real partial match
      - No intended major set  -> 35, an open-to-anyone baseline that
        deliberately ranks *below* any genuine partial match
      - Unrelated major        -> 15 floor

    The year bonus (+10, capped at 100) applies when the group's courses sit
    at the user's course level.
    """
    if not group_major:
        base = 35
    elif group_major.strip().lower() == user_major.strip().lower():
        base = 95
    else:
        # Ignore filler words so "Computer Science" vs "Computer Engineering"
        # isn't diluted, and compare on the meaningful terms only.
        stop = {"and", "of", "the", "in", "with", "&"}
        user_words = {w for w in user_major.lower().split() if w not in stop}
        group_words = {w for w in group_major.lower().split() if w not in stop}
        union = user_words | group_words
        if not union:
            base = 35
        else:
            ratio = len(user_words & group_words) / len(union)
            # No shared terms at all -> unrelated floor, not a 0 that would
            # rank below groups with no major set.
            base = 15 if ratio == 0 else round(45 + ratio * 40)

    if year_match:
        base += 10

    return max(5, min(100, base))


@app.get("/recommendations/major")
async def get_major_recommendations(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    include_joined: bool = Query(True, description="Include groups the user is already in"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Group suggestions ranked by how well each fits the user's major/year.

    Each group carries its next couple of upcoming sessions so a student can
    see real activity before deciding whether to join.

    Paginated, and batched rather than per-group: the previous version ran
    four queries inside a loop over every public group, which on a few
    hundred groups meant a four-figure query count per page load.
    """
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # An admin account that has a major/year set (common for staff who also
    # study, and for demo/test accounts) gets real recommendations like any
    # other user. "Not applicable" is only for an admin with no student
    # profile, where the "complete your profile" prompt would be noise.
    is_admin = str(current_user.get("role", "")).lower().endswith("admin")
    if is_admin and not (user.major and user.year_of_study):
        return {
            "profile_complete": False,
            "not_applicable": True,
            "reason": "Group recommendations are personalised to a student's major and year.",
            "major": user.major,
            "year_of_study": user.year_of_study,
            "total": 0,
            "limit": limit,
            "offset": offset,
            "recommendations": [],
        }

    if not (user.major and user.year_of_study):
        return {
            "profile_complete": False,
            "not_applicable": False,
            "major": user.major,
            "year_of_study": user.year_of_study,
            "total": 0,
            "limit": limit,
            "offset": offset,
            "recommendations": [],
        }

    joined_group_ids = {
        m.group_id for m in
        db.query(GroupMembership).filter(GroupMembership.user_id == user.id).all()
    }
    user_level = _YEAR_TO_LEVEL.get(user.year_of_study)
    now = datetime.utcnow()

    groups = (db.query(Group)
                .filter(Group.is_public == True,          # noqa: E712
                        Group.is_deleted == False)         # noqa: E712
                .all())
    if not include_joined:
        groups = [g for g in groups if g.id not in joined_group_ids]

    if not groups:
        return {
            "profile_complete": True,
            "not_applicable": False,
            "major": user.major,
            "year_of_study": user.year_of_study,
            "total": 0,
            "limit": limit,
            "offset": offset,
            "recommendations": [],
        }

    group_ids = [g.id for g in groups]

    # ── Batched lookups: three queries total, regardless of group count ──

    member_counts = dict(
        db.query(GroupMembership.group_id, func.count(GroupMembership.id))
          .filter(GroupMembership.group_id.in_(group_ids))
          .group_by(GroupMembership.group_id)
          .all()
    )

    courses_by_group: dict = {}
    for gid, code in (db.query(GroupCourse.group_id, Course.course_code)
                        .join(Course, GroupCourse.course_id == Course.id)
                        .filter(GroupCourse.group_id.in_(group_ids))
                        .all()):
        courses_by_group.setdefault(gid, []).append(code)

    sessions_by_group: dict = {}
    for sess in (db.query(StudySession)
                   .filter(StudySession.group_id.in_(group_ids),
                           StudySession.is_cancelled == False,   # noqa: E712
                           StudySession.is_deleted == False,     # noqa: E712
                           StudySession.scheduled_at >= now)
                   .order_by(StudySession.scheduled_at.asc())
                   .all()):
        # Two per group is all the card shows; skip the rest.
        bucket = sessions_by_group.setdefault(sess.group_id, [])
        if len(bucket) < 2:
            bucket.append(sess)

    results = []
    for group in groups:
        course_codes = sorted(courses_by_group.get(group.id, []))
        levels = {lvl for code in course_codes if (lvl := _course_level(code)) is not None}
        year_match = bool(user_level and user_level in levels)

        results.append({
            "group_id": str(group.id),
            "name": group.name,
            "description": group.description,
            "member_count": member_counts.get(group.id, 0),
            "course_codes": course_codes,
            "year_match": year_match,
            "match_pct": _major_match_pct(user.major, group.intended_major, year_match),
            "already_joined": group.id in joined_group_ids,
            "upcoming_sessions": [
                {
                    "id": str(s.id),
                    "title": s.title,
                    "scheduled_at": iso_utc(s.scheduled_at),
                    "location": s.location,
                }
                for s in sessions_by_group.get(group.id, [])
            ],
        })

    # Highest major match first, then groups at the user's course level,
    # then by size. Groups the user already belongs to sink to the bottom.
    results.sort(key=lambda r: (
        r["already_joined"],
        -r["match_pct"],
        not r["year_match"],
        -r["member_count"],
        r["name"],
    ))

    total = len(results)
    return {
        "profile_complete": True,
        "not_applicable": False,
        "major": user.major,
        "year_of_study": user.year_of_study,
        "total": total,
        "limit": limit,
        "offset": offset,
        "recommendations": results[offset:offset + limit],
    }


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