import os, duckdb
import pandas as pd
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ["DATABASE_URL"]
LAKE_PATH    = os.environ.get("DELTA_LAKE_PATH", "/data/delta-lake")

engine = create_engine(DATABASE_URL)

def compute_recommendations():
    con = duckdb.connect()

    # Read feature table directly from Parquet via DuckDB
    features = con.execute(f"""
        SELECT user_id, course_ids, groups_joined, resources_uploaded
        FROM   delta_scan('{LAKE_PATH}/recommendation_features')
    """).df()

    # Read all groups + their courses from PostgreSQL
    with engine.connect() as conn:
        groups = pd.read_sql(text("""
            SELECT g.id AS group_id, array_agg(gc.course_id) AS course_ids
            FROM   groups g
            JOIN   group_courses gc ON gc.group_id = g.id
            GROUP  BY g.id
        """), conn)

    recs = []
    for _, user_row in features.iterrows():
        user_courses = set(user_row["course_ids"] or [])
        for _, g_row in groups.iterrows():
            g_courses = set(g_row["course_ids"] or [])
            overlap = len(user_courses & g_courses)
            if overlap > 0:
                recs.append({
                    "user_id":  user_row["user_id"],
                    "group_id": g_row["group_id"],
                    "score":    overlap,
                })

    recs_df = pd.DataFrame(recs).sort_values("score", ascending=False)

    # Write back to PostgreSQL recommendations table
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE recommendations"))
        if not recs_df.empty:
            recs_df.to_sql("recommendations", conn,
                           if_exists="append", index=False)

    print(f"Wrote {len(recs_df)} recommendations.")

if __name__ == "__main__":
    compute_recommendations()