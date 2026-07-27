"""
services/recommendations-service/main.py
Recommendations Service - serve study-group recommendations.
Reads precomputed scores from the recommendations table (written by the ETL/ML pipeline).
Runs on port 8008
"""
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session
from collections import defaultdict
from datetime import datetime, timedelta

import sys
sys.path.append("/shared")
from shared_models import (
    Recommendation, Group, GroupMembership, UserEnrollment,
    GroupCourse, Course, User, StudySession, Resource, Base
)
from shared_database import engine, get_db, run_light_migrations
from shared_auth import get_current_user

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

    # 2. Fallback: live multi-signal scoring
    user_courses = {e.course_id for e in
                    db.query(UserEnrollment).filter(UserEnrollment.user_id == user_id).all()}
    if not user_courses:
        return {"recommendations": [], "source": "fallback"}

    me = db.query(User).filter(User.id == user_id).first()
    signals = _build_scoring_signals(db, user_id, user_courses, joined_group_ids, me)

    scored = []
    for group in signals["candidates"]:
        breakdown = _score_group(group, signals)
        if breakdown["score"] <= 0:
            continue
        scored.append({
            "group_id": str(group.id),
            "name": group.name,
            "score": breakdown["score"],
            "reasons": breakdown["reasons"],
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return {"recommendations": scored[:10], "source": "fallback"}


# ── Scoring ──────────────────────────────────────────────────────────────────
#
# The old scorer was `min(overlap * 50, 100)`, which meant almost every group
# scored exactly 50 (one shared course) — the number carried no ranking
# information. This version blends five signals into a 0-100 score so the
# percentage actually differentiates groups:
#
#   Course fit       45 pts  how well the group's courses match yours
#   Peer overlap     20 pts  classmates / people you already study with
#   Activity         20 pts  is the group actually alive
#   Size fit         10 pts  4-8 members studies better than 1 or 40
#   Context           5 pts  same term/section, same major
#
# All the per-group data is fetched in bulk up front, so scoring N groups costs
# a constant number of queries rather than 3N.

WEIGHTS = {"course": 45, "peers": 20, "activity": 20, "size": 10, "context": 5}


def _build_scoring_signals(db, user_id, user_courses, joined_group_ids, me,
                           include_group=None):
    """Bulk-load everything the scorer needs for all candidate groups.

    `include_group` forces one extra group into the loaded data even if it isn't
    a recommendation candidate — used by /explain, which may be asked about a
    group the user already joined or created.
    """
    candidates = [
        g for g in db.query(Group).filter(
            Group.is_public == True,
            Group.is_deleted == False,
        ).all()
        if g.id not in joined_group_ids and str(g.created_by) != str(user_id)
    ]
    candidate_ids = [g.id for g in candidates]
    if include_group is not None and include_group.id not in candidate_ids:
        candidate_ids.append(include_group.id)

    courses_by_group = defaultdict(set)
    members_by_group = defaultdict(set)
    upcoming_by_group = defaultdict(int)
    recent_by_group = defaultdict(int)
    resources_by_group = defaultdict(int)

    if candidate_ids:
        for gc in db.query(GroupCourse).filter(GroupCourse.group_id.in_(candidate_ids)).all():
            courses_by_group[gc.group_id].add(gc.course_id)

        for m in db.query(GroupMembership).filter(GroupMembership.group_id.in_(candidate_ids)).all():
            members_by_group[m.group_id].add(m.user_id)

        now = datetime.utcnow()
        recent_cutoff = now - timedelta(days=30)
        for s in db.query(StudySession).filter(
            StudySession.group_id.in_(candidate_ids),
            StudySession.is_cancelled == False,
            StudySession.is_deleted == False,
        ).all():
            if s.scheduled_at and s.scheduled_at >= now:
                upcoming_by_group[s.group_id] += 1
            elif s.scheduled_at and s.scheduled_at >= recent_cutoff:
                recent_by_group[s.group_id] += 1

        for r in db.query(Resource).filter(
            Resource.group_id.in_(candidate_ids),
            Resource.is_deleted == False,
        ).all():
            resources_by_group[r.group_id] += 1

    # People I already study with — used as a familiarity signal.
    my_peers = set()
    if joined_group_ids:
        for m in db.query(GroupMembership).filter(
            GroupMembership.group_id.in_(list(joined_group_ids))
        ).all():
            if m.user_id != user_id:
                my_peers.add(m.user_id)

    # Which candidate-group members share a course with me.
    all_member_ids = {uid for members in members_by_group.values() for uid in members}
    classmates = set()
    if all_member_ids:
        for e in db.query(UserEnrollment).filter(
            UserEnrollment.user_id.in_(list(all_member_ids)),
            UserEnrollment.course_id.in_(list(user_courses)),
        ).all():
            classmates.add(e.user_id)

    # My current term, inferred from the groups I'm already in.
    my_session = None
    if joined_group_ids:
        sessions = [
            g.session for g in
            db.query(Group).filter(Group.id.in_(list(joined_group_ids))).all()
            if g.session
        ]
        if sessions:
            my_session = max(set(sessions), key=sessions.count)

    return {
        "candidates": candidates,
        "user_courses": user_courses,
        "courses_by_group": courses_by_group,
        "members_by_group": members_by_group,
        "upcoming_by_group": upcoming_by_group,
        "recent_by_group": recent_by_group,
        "resources_by_group": resources_by_group,
        "my_peers": my_peers,
        "classmates": classmates,
        "my_session": my_session,
        "my_major": (me.major if me else None),
    }


def _score_group(group, s):
    """Score one group 0-100 and explain which signals contributed."""
    user_courses = s["user_courses"]
    group_courses = s["courses_by_group"].get(group.id, set())
    members = s["members_by_group"].get(group.id, set())
    overlap = user_courses & group_courses
    reasons = []

    # 1. Course fit — mostly "how much of this group's focus do I share",
    #    plus a smaller bonus for sharing several courses with it.
    if not overlap:
        return {"score": 0, "reasons": []}
    focus = len(overlap) / len(group_courses) if group_courses else 0
    depth = min(len(overlap) / 3, 1.0)
    course_pts = WEIGHTS["course"] * (0.75 * focus + 0.25 * depth)
    if len(overlap) == 1:
        reasons.append("Shares a course you're enrolled in")
    else:
        reasons.append(f"Shares {len(overlap)} of your courses")

    # 2. Peer overlap — classmates in the group, and people you already study with.
    size = max(len(members), 1)
    classmate_count = len(members & s["classmates"])
    familiar_count = len(members & s["my_peers"])
    peer_ratio = classmate_count / size
    peer_pts = WEIGHTS["peers"] * (0.6 * peer_ratio + 0.4 * min(familiar_count / 3, 1.0))
    if classmate_count:
        reasons.append(f"{classmate_count} member(s) take a course with you")
    if familiar_count:
        reasons.append(f"{familiar_count} member(s) already study with you")

    # 3. Activity — a group with upcoming sessions beats a dormant one.
    upcoming = s["upcoming_by_group"].get(group.id, 0)
    recent = s["recent_by_group"].get(group.id, 0)
    resources = s["resources_by_group"].get(group.id, 0)
    activity = (
        0.5 * min(upcoming / 2, 1.0)
        + 0.25 * min(recent / 2, 1.0)
        + 0.25 * min(resources / 5, 1.0)
    )
    activity_pts = WEIGHTS["activity"] * activity
    if upcoming:
        reasons.append(f"{upcoming} upcoming session(s)")
    if resources:
        reasons.append(f"{resources} shared resource(s)")

    # 4. Size fit — small-group studying works best around 4-8 people.
    if size <= 1:
        size_factor = 0.3
    elif size <= 3:
        size_factor = 0.7
    elif size <= 8:
        size_factor = 1.0
    elif size <= 15:
        size_factor = 0.7
    else:
        size_factor = 0.4
    size_pts = WEIGHTS["size"] * size_factor

    # 5. Context — same term/section and same major as you.
    context = 0.0
    if s["my_session"] and group.session and group.session == s["my_session"]:
        context += 0.6
        reasons.append(f"Running in {group.session}")
    if s["my_major"] and group.intended_major and group.intended_major == s["my_major"]:
        context += 0.4
        reasons.append("Matches your major")
    context_pts = WEIGHTS["context"] * context

    total = course_pts + peer_pts + activity_pts + size_pts + context_pts
    # Keep it off the extremes: a live recommendation is never a literal 0 or a
    # promised-perfect 100.
    score = max(5, min(99, round(total)))

    return {"score": score, "reasons": reasons[:3]}


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
    Groups aren't restricted to an exact major match — every open group is
    shown, scored by how relevant it is:
      - Exact major match           -> 100 (or 100 with the year bonus, capped)
      - No intended major set       -> 40  (open to everyone, moderate baseline)
      - Partial/related major       -> scaled by shared words between the two
        major names (e.g. "Software Engineering" vs "Computer Engineering"
        share "Engineering")
    A +10 bonus is added when the group's courses sit at the user's year
    level, capped at 100.
    """
    if not group_major:
        base = 40
    elif group_major.strip().lower() == user_major.strip().lower():
        base = 100
    else:
        user_words = set(user_major.lower().split())
        group_words = set(group_major.lower().split())
        overlap = len(user_words & group_words)
        union = len(user_words | group_words) or 1
        base = round((overlap / union) * 80)  # partial credit only, never hits 100

    if year_match:
        base = min(100, base + 10)

    return max(base, 5)


@app.get("/recommendations/major")
async def get_major_recommendations(db: Session = Depends(get_db),
                                    current_user: dict = Depends(get_current_user)):
    """Group suggestions based on the user's major, weighted by which year
    the user is in (groups whose courses sit at the user's level rank
    first). Requires a completed profile — otherwise the frontend shows
    "complete setting up your profile to see recommendations". Each group
    includes its next couple of upcoming sessions so the student can see
    real activity before deciding whether to join."""
    from datetime import datetime

    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not (user.major and user.year_of_study):
        return {
            "profile_complete": False,
            "major": user.major,
            "year_of_study": user.year_of_study,
            "recommendations": [],
        }

    joined_group_ids = {
        m.group_id for m in
        db.query(GroupMembership).filter(GroupMembership.user_id == user.id).all()
    }
    user_level = _YEAR_TO_LEVEL.get(user.year_of_study)
    now = datetime.utcnow()

    results = []
    # Every open group is shown here — not just groups whose intended_major
    # exactly matches the user's. Relevance is instead expressed as a match
    # percentage (see _major_match_pct) so the student can see the whole
    # landscape of groups, ranked by how well each fits their major.
    groups = (db.query(Group)
                .filter(Group.is_public == True,          # noqa: E712
                        Group.is_deleted == False)         # noqa: E712
                .all())
    for group in groups:
        already_joined = group.id in joined_group_ids

        member_count = (db.query(GroupMembership)
                          .filter(GroupMembership.group_id == group.id)
                          .count())
        course_rows = (db.query(Course)
                         .join(GroupCourse, GroupCourse.course_id == Course.id)
                         .filter(GroupCourse.group_id == group.id)
                         .all())
        course_codes = sorted(c.course_code for c in course_rows)
        levels = {lvl for c in course_rows if (lvl := _course_level(c.course_code)) is not None}
        year_match = bool(user_level and user_level in levels)
        match_pct = _major_match_pct(user.major, group.intended_major, year_match)

        upcoming_sessions = (db.query(StudySession)
                               .filter(StudySession.group_id == group.id,
                                       StudySession.is_cancelled == False,   # noqa: E712
                                       StudySession.scheduled_at >= now)
                               .order_by(StudySession.scheduled_at.asc())
                               .limit(2)
                               .all())

        results.append({
            "group_id": str(group.id),
            "name": group.name,
            "description": group.description,
            "member_count": member_count,
            "course_codes": course_codes,
            "year_match": year_match,
            "match_pct": match_pct,
            "already_joined": already_joined,
            "upcoming_sessions": [
                {
                    "id": str(s.id),
                    "title": s.title,
                    "scheduled_at": s.scheduled_at.isoformat(),
                    "location": s.location,
                }
                for s in upcoming_sessions
            ],
        })

    # Highest major match first, then groups at the user's course level, then by size.
    results.sort(key=lambda r: (-r["match_pct"], not r["year_match"], -r["member_count"], r["name"]))
    return {
        "profile_complete": True,
        "major": user.major,
        "year_of_study": user.year_of_study,
        "recommendations": results,
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

    # Get precomputed score if available, else score it live with the same
    # multi-signal function the list endpoint uses so the two agree.
    rec = (db.query(Recommendation)
             .filter(Recommendation.user_id == user_id,
                     Recommendation.group_id == group_id)
             .first())
    if rec:
        score = rec.score
        score_reasons = []
    else:
        joined_group_ids = {
            m.group_id for m in db.query(GroupMembership).filter(
                GroupMembership.user_id == user_id
            ).all()
        }
        me = db.query(User).filter(User.id == user_id).first()
        signals = _build_scoring_signals(
            db, user_id, user_courses, joined_group_ids, me, include_group=group
        )
        breakdown = _score_group(group, signals)
        score = breakdown["score"]
        score_reasons = breakdown["reasons"]

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
            "reasons": score_reasons,
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
        "reasons": score_reasons,
        "explanation": explanation,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)