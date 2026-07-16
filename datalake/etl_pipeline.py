import os
import pandas as pd
from deltalake.writer import write_deltalake
from sqlalchemy import create_engine, text
from datetime import datetime, timezone

DATABASE_URL = os.environ["DATABASE_URL"]
LAKE_PATH    = os.environ.get("DELTA_LAKE_PATH", "/data/delta-lake")

engine = create_engine(DATABASE_URL)

def safe_read(conn, query, fallback_df):
    try:
        return pd.read_sql(text(query), conn)
    except Exception as e:
        print(f"  Skipped (table not ready): {e.__class__.__name__}")
        return fallback_df

def run_etl():
    with engine.connect() as conn:

        print("→ activity_events")
        events = safe_read(conn, """
            SELECT 'group_join' AS event_type,
                   user_id, group_id, NULL::uuid AS resource_id,
                   created_at AS ts
            FROM   group_memberships
            UNION ALL
            SELECT 'resource_upload',
                   uploaded_by AS user_id, group_id, id AS resource_id,
                   created_at AS ts
            FROM   resources
        """, pd.DataFrame({
            "event_type":  pd.Series([], dtype="str"),
            "user_id":     pd.Series([], dtype="str"),
            "group_id":    pd.Series([], dtype="str"),
            "resource_id": pd.Series([], dtype="str"),
            "ts":          pd.Series([], dtype="datetime64[us, UTC]"),
        }))
        events["ts"] = pd.to_datetime(events["ts"], utc=True)
        write_deltalake(f"{LAKE_PATH}/activity_events",
                        events, mode="append", schema_mode="merge")
        print(f"   wrote {len(events)} rows")

        print("→ resource_metadata")
        resources = safe_read(conn, """
            SELECT id AS file_id, uploaded_by AS user_id,
                   group_id, file_type, file_url, created_at AS ts
            FROM   resources
        """, pd.DataFrame({
            "file_id":   pd.Series([], dtype="str"),
            "user_id":   pd.Series([], dtype="str"),
            "group_id":  pd.Series([], dtype="str"),
            "file_type": pd.Series([], dtype="str"),
            "file_url":  pd.Series([], dtype="str"),
            "ts":        pd.Series([], dtype="datetime64[us, UTC]"),
        }))
        resources["ts"] = pd.to_datetime(resources["ts"], utc=True)
        write_deltalake(f"{LAKE_PATH}/resource_metadata",
                        resources, mode="append", schema_mode="merge")
        print(f"   wrote {len(resources)} rows")

        print("→ recommendation_features")
        features = safe_read(conn, """
            SELECT ue.user_id,
                   array_agg(DISTINCT ue.course_id) AS course_ids,
                   COUNT(DISTINCT gm.group_id)       AS groups_joined,
                   COUNT(DISTINCT r.id)              AS resources_uploaded
            FROM   user_enrollments ue
            LEFT JOIN group_memberships gm ON gm.user_id = ue.user_id
            LEFT JOIN resources r          ON r.uploaded_by = ue.user_id
            GROUP BY ue.user_id
        """, pd.DataFrame({
            "user_id":              pd.Series([], dtype="str"),
            "course_ids":           pd.Series([], dtype="str"),
            "groups_joined":        pd.Series([], dtype="int64"),
            "resources_uploaded":   pd.Series([], dtype="int64"),
        }))
        write_deltalake(f"{LAKE_PATH}/recommendation_features",
                        features, mode="overwrite", schema_mode="overwrite")
        print(f"   wrote {len(features)} rows")

    print(f"\nETL done at {datetime.now(timezone.utc).isoformat()}")