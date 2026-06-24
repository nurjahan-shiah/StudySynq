"""
services/auth-service/main.py
Authentication Service
- User registration (with role assignment: Student / Group Leader / Admin)
- User login (returns JWT token)
- Token validation (used by other services via HTTP calls)
- First-login welcome state

Runs on port 8001
"""

from uuid import uuid4
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr
from contextlib import asynccontextmanager

import sys
sys.path.append("/shared")
from shared_models import User, UserRole, Base
from shared_database import SessionLocal, engine, get_db
from shared_auth import hash_password, verify_password, create_access_token
from shared_schemas import UserRegister, UserLogin, TokenResponse

# ============================================================================
# Initialize Database
# ============================================================================

def init_db():
    """Create tables if they don't exist."""
    Base.metadata.create_all(bind=engine)

async def lifespan(app: FastAPI):
    """Startup and shutdown."""
    print("🔐 Auth Service starting...")
    init_db()
    yield
    print("🛑 Auth Service shutting down...")

app = FastAPI(
    title="StudySync Auth Service",
    description="User authentication and JWT token management",
    version="1.0.0",
    lifespan=lifespan
)

# ============================================================================
# Role mapping helper
# ============================================================================

ROLE_MAP = {
    "student": UserRole.STUDENT,
    "group_leader": UserRole.GROUP_LEADER,
    "admin": UserRole.ADMIN,
}

# ============================================================================
# Routes
# ============================================================================

@app.get("/auth/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "auth-service"}


@app.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user account.

    - Validates password strength (enforced by schema)
    - Checks for duplicate email
    - Assigns requested role (Student / Group Leader / Admin)
    - Returns JWT token + is_first_login=True on success (auto-login)
    """
    # Duplicate-email check
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Resolve role
    role = ROLE_MAP.get(user_data.role, UserRole.STUDENT)

    # Create user
    new_user = User(
        id=uuid4(),
        name=user_data.name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=role,
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    access_token = create_access_token(
        user_id=new_user.id,
        user_email=new_user.email,
        user_role=new_user.role.value
    )

    return TokenResponse(
        access_token=access_token,
        user_id=new_user.id,
        user_email=new_user.email,
        user_role=new_user.role.value,
        is_first_login=True,   # Always True on registration → welcome state
    )


@app.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user and return JWT token.
    is_first_login is always False for subsequent logins.
    """
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    access_token = create_access_token(
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value
    )

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value,
        is_first_login=False,
    )


@app.get("/auth/validate")
async def validate_token(authorization: str = None):
    """
    Internal endpoint: validate a JWT token.
    Used by other services to verify tokens.

    Expected header: Authorization: Bearer <token>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )

    token = authorization.split(" ")[1]

    try:
        from shared_auth import decode_token
        payload = decode_token(token)
        return {
            "valid": True,
            "user_id": str(payload["user_id"]),
            "email": payload["email"],
            "role": payload["role"]
        }
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)