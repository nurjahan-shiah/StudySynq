"""
services/auth-service/main.py
Authentication Service
- User registration (with role assignment: Student / Group Leader / Admin)
- User login (returns JWT token)
- Token validation (used by other services via HTTP calls)
- First-login welcome state
- Refresh-token session renewal
- User logout

Runs on port 8001
"""

import os
import sys
from contextlib import asynccontextmanager
from typing import Optional
from uuid import uuid4

from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Response,
    status,
)
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr

sys.path.append("/shared")

from shared_models import User, UserRole, Base
from shared_database import SessionLocal, engine, get_db
from shared_auth import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from shared_schemas import UserRegister, UserLogin, TokenResponse

# ============================================================================
# Session Configuration
# ============================================================================

REFRESH_COOKIE_NAME = "refresh_token"

REFRESH_TOKEN_EXPIRE_DAYS = int(
    os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")
)

COOKIE_SECURE = (
    os.getenv("COOKIE_SECURE", "false").lower() == "true"
)

# ============================================================================
# Initialize Database
# ============================================================================

def init_db():
    """Create tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
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
# Session helpers
# ============================================================================

def set_refresh_cookie(
    response: Response,
    refresh_token: str
):
    """
    Store the refresh token in an HttpOnly cookie.

    HttpOnly prevents frontend JavaScript from reading the token.
    COOKIE_SECURE should be true when the application uses HTTPS.
    """
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/"
    )


def clear_refresh_cookie(response: Response):
    """Remove the refresh-token cookie from the browser."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/"
    )


def ensure_user_is_active(
    user: User,
    db: Session
):
    """Reject a login or refresh request for a deactivated user."""

    # M3 — block deactivated accounts (is_active column added by admin-service migration)
    try:
        from sqlalchemy import text as _sqlt

        row = db.execute(
            _sqlt(
                "SELECT is_active "
                "FROM users "
                "WHERE id = :uid"
            ),
            {"uid": str(user.id)}
        ).fetchone()

        if row is not None and not row[0]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Account has been deactivated. "
                    "Contact an administrator."
                )
            )
    except HTTPException:
        raise
    except Exception:
        pass  # column not yet migrated — fail-open

# ============================================================================
# Routes
# ============================================================================

@app.get("/auth/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "auth-service"}


@app.post("/auth/register", response_model=TokenResponse)
async def register(
    user_data: UserRegister,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Register a new user account.

    - Validates password strength (enforced by schema)
    - Checks for duplicate email
    - Assigns requested role (Student / Group Leader / Admin)
    - Returns JWT token + is_first_login=True on success (auto-login)
    """
    # Duplicate-email check
    existing = (
        db.query(User)
        .filter(User.email == user_data.email)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Resolve role
    role = ROLE_MAP.get(
        user_data.role,
        UserRole.STUDENT
    )

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

    refresh_token = create_refresh_token(
        user_id=new_user.id,
        user_email=new_user.email,
        user_role=new_user.role.value
    )

    set_refresh_cookie(
        response=response,
        refresh_token=refresh_token
    )

    return TokenResponse(
        access_token=access_token,
        user_id=new_user.id,
        user_email=new_user.email,
        user_role=new_user.role.value,
        is_first_login=True,   # Always True on registration → welcome state
    )


@app.post("/auth/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Authenticate user and return JWT token.
    is_first_login is always False for subsequent logins.
    """
    user = (
        db.query(User)
        .filter(User.email == credentials.email)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if not verify_password(
        credentials.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    ensure_user_is_active(
        user=user,
        db=db
    )

    access_token = create_access_token(
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value
    )

    refresh_token = create_refresh_token(
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value
    )

    set_refresh_cookie(
        response=response,
        refresh_token=refresh_token
    )

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value,
        is_first_login=False,
    )


@app.post("/auth/refresh", response_model=TokenResponse)
async def refresh_session(
    response: Response,
    refresh_token: Optional[str] = Cookie(
        default=None,
        alias=REFRESH_COOKIE_NAME
    ),
    db: Session = Depends(get_db)
):
    """
    Issue a new access token using the refresh-token cookie.

    The refresh token is rotated after every successful request.
    """
    if not refresh_token:
        clear_refresh_cookie(response)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing"
        )

    try:
        payload = decode_refresh_token(refresh_token)
    except HTTPException:
        clear_refresh_cookie(response)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired"
        )

    user = (
        db.query(User)
        .filter(User.id == payload["user_id"])
        .first()
    )

    if not user:
        clear_refresh_cookie(response)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists"
        )

    ensure_user_is_active(
        user=user,
        db=db
    )

    access_token = create_access_token(
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value
    )

    new_refresh_token = create_refresh_token(
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value
    )

    set_refresh_cookie(
        response=response,
        refresh_token=new_refresh_token
    )

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value,
        is_first_login=False,
    )


@app.post("/auth/logout")
async def logout(response: Response):
    """
    Log out the current user by removing the refresh-token cookie.

    The frontend must also remove the access token from local storage.
    """
    clear_refresh_cookie(response)

    return {
        "message": "Logged out successfully"
    }


@app.get("/auth/validate")
async def validate_token(
    authorization: Optional[str] = Header(default=None)
):
    """
    Internal endpoint: validate a JWT token.
    Used by other services to verify tokens.

    Expected header: Authorization: Bearer <token>
    """
    if (
        not authorization
        or not authorization.startswith("Bearer ")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header"
        )

    token = authorization.split(" ", 1)[1].strip()

    try:
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

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001
    )