"""
datalake/recommender.py
US-F.4 — Recommendation Engine (Course-Overlap Scoring)

Reads per-user course-activity features out of Delta Lake (via DuckDB), reads
each group's linked courses from PostgreSQL, and scores every (user, group)
pair with a scikit-learn cosine-similarity model over course-membership
vectors. Ranked scores are written back to the `recommendations` table for
the recommendations-service to serve.
"""

import os
import duckdb
import pandas as pd
from sqlalchemy import create_engine, text
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.metrics.pairwise import cosine_similarity

DATABASE_URL = os.environ["DATABASE_URL"]
LAKE_PATH    = os.environ.get("DELTA_LAKE_PATH", "/data/delta-lake")

engine = create_engine(DATABASE_URL)


def compute_recommendations():
    con = duckdb.connect()

    # 1. Read the per-user feature table straight from Parquet via DuckDB.
    #    (Built by the ETL job in etl_pipeline.py — one row per user with the
    #    set of courses they're enrolled in.)
    features = con.execute(f"""
        SELECT user_id, course_ids, groups_joined, resources_uploaded
        FROM   delta_scan('{LAKE_PATH}/recommendation_features')
    """).df()

    if features.empty:
        print("No user features available yet — skipping this run.")
        return

    # 2. Read every group + its linked courses from PostgreSQL.
    with engine.connect() as conn:
        groups_raw = pd.read_sql(text("""
            SELECT g.id AS group_id, gc.course_id
            FROM   groups g
            JOIN   group_courses gc ON gc.group_id = g.id
        """), conn)

    if groups_raw.empty:
        print("No groups with linked courses yet — skipping this run.")
        return

    # Let DuckDB do the course-overlap grouping/aggregation into one row
    # per group with its full set of linked courses.
    groups = con.execute("""
        SELECT group_id, array_agg(DISTINCT course_id) AS course_ids
        FROM   groups_raw
        GROUP  BY group_id
    """).df()

    # 3. Build course-membership vectors for users and groups on a shared
    #    course vocabulary, so their columns line up 1:1.
    user_courses  = [set(c or []) for c in features["course_ids"]]
    group_courses = [set(c or []) for c in groups["course_ids"]]

    vocabulary = sorted(set().union(*user_courses, *group_courses)) if (user_courses or group_courses) else []
    if not vocabulary:
        print("No course overlap data available yet — skipping this run.")
        return

    mlb = MultiLabelBinarizer(classes=vocabulary)
    mlb.fit([vocabulary])  # lock in the shared column ordering

    U = mlb.transform(user_courses)   # (n_users x n_courses)
    G = mlb.transform(group_courses)  # (n_groups x n_courses)

    # 4. Score every (user, group) pair with cosine similarity between their
    #    course-membership vectors — scikit-learn doing the ranking rather
    #    than a hand-rolled overlap-count loop.
    similarity = cosine_similarity(U, G)  # (n_users x n_groups)

    user_ids  = features["user_id"].tolist()
    group_ids = groups["group_id"].tolist()

    recs = []
    for i, user_id in enumerate(user_ids):
        for j, group_id in enumerate(group_ids):
            score = similarity[i, j]
            if score > 0:
                recs.append({
                    "user_id":  user_id,
                    "group_id": group_id,
                    # Scale 0-1 cosine similarity to a 0-100 match score.
                    "score":    round(float(score) * 100, 2),
                })

    recs_df = pd.DataFrame(recs)
    if not recs_df.empty:
        recs_df = recs_df.sort_values(["user_id", "score"], ascending=[True, False])

    # 5. Write ranked scores back to PostgreSQL for the recommendations
    #    service to serve.
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE recommendations"))
        if not recs_df.empty:
            recs_df.to_sql("recommendations", conn, if_exists="append", index=False)

    print(f"Wrote {len(recs_df)} recommendations (cosine-similarity model, "
          f"{len(vocabulary)} courses in vocabulary).")


if __name__ == "__main__":
    compute_recommendations()
