"""
shared/database.py
Database connection factory for all microservices.
All services use the same PostgreSQL instance.
"""

import os
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin:secret@db:5432/studysynq"
)

# Connection pool: min 5 connections, max 20
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=15,
    pool_pre_ping=True,  # Test connection before using
    echo=False  # Set to True for SQL logging during development
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

def get_db() -> Iterator[Session]:
    """
    FastAPI dependency: yields a database session.

    Annotated as Iterator[Session] rather than Session because this is a
    generator — it yields the session and closes it on teardown. FastAPI
    resolves the yielded value, so routes still annotate the parameter as
    `db: Session = Depends(get_db)`.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Initialize database tables.
    Call this once at service startup.
    """
    from shared_models import Base
    Base.metadata.create_all(bind=engine)
def run_light_migrations(engine_=None):
    """Idempotent ALTER TABLEs for columns added after the initial schema.

    Base.metadata.create_all creates missing *tables* but never alters existing
    ones, so profile columns added to `users` must be applied here. Safe to run
    on every service startup; each statement is a no-op when already applied.
    """
    from sqlalchemy import text

    eng = engine_ or engine
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS major VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS year_of_study VARCHAR(20)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_privacy JSONB",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS faculty VARCHAR(255)",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS year_level INTEGER",
        "ALTER TABLE groups ADD COLUMN IF NOT EXISTS session VARCHAR(10)",
        "ALTER TABLE groups ADD COLUMN IF NOT EXISTS section VARCHAR(20)",
        # US-F.2: sessions are moderatable too (admin delete, distinct from
        # a leader's cancel).
        "ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        "ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS deleted_by UUID",
        # Campus feed. These columns exist on the Post/PostComment models but
        # were never migrated onto pre-existing tables — so every INSERT named
        # a column Postgres didn't have, and posting failed outright.
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        "ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_by UUID",
        "ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        "ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS deleted_by UUID",
        # Friend blocking.
        "ALTER TABLE friendships ADD COLUMN IF NOT EXISTS blocked_by UUID",
        "ALTER TABLE friendships ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP",
    ]
    for stmt in statements:
        try:
            with eng.begin() as conn:
                conn.execute(text(stmt))
        except Exception as exc:  # pragma: no cover — never block startup
            print(f"[light-migration] skipped '{stmt}': {exc}")