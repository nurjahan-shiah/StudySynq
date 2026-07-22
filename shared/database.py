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
    "postgresql://admin:secret@db:5432/studysync"
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