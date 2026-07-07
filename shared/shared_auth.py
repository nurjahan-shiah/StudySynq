"""
shared/auth.py
JWT token generation and verification used across all microservices.
Centralized so token format is consistent everywhere.
"""

import os
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ============================================================================
# Configuration
# ============================================================================

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "your-secret-key-change-in-production"
)

ALGORITHM = os.getenv("ALGORITHM", "HS256")

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)

# Password hashing context
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# ============================================================================
# Password Utilities
# ============================================================================

def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    """Verify a plaintext password against a hash."""
    return pwd_context.verify(
        plain_password,
        hashed_password
    )

# ============================================================================
# JWT Utilities
# ============================================================================

def create_access_token(
    user_id: UUID,
    user_email: str,
    user_role: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT token for a user.
    Token payload includes user_id, email, and role.
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {
        "sub": str(user_id),
        "email": user_email,
        "role": user_role,
        "exp": expire
    }

    encoded_jwt = jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return encoded_jwt


def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT token.
    Returns token payload if valid.
    Raises HTTPException if invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id: str = (
            payload.get("user_id")
            or payload.get("sub")
        )
        email: str = payload.get("email")
        role: str = payload.get("role")

        if (
            user_id is None
            or email is None
            or role is None
        ):
            raise credentials_exception

        return {
            "user_id": UUID(user_id),
            "email": email,
            "role": role
        }

    except (JWTError, ValueError, TypeError):
        raise credentials_exception

# ============================================================================
# FastAPI Dependencies
# ============================================================================

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[
        HTTPAuthorizationCredentials
    ] = Depends(security)
):
    """
    FastAPI dependency for protected routes.
    Validates JWT token and returns user info.

    Usage:
        @app.get("/protected")
        def protected_route(
            user=Depends(get_current_user)
        ):
            return {"user_id": user["user_id"]}
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return decode_token(credentials.credentials)

# ============================================================================
# Role-Based Access Control
# ============================================================================

VALID_USER_ROLES = frozenset({
    "student",
    "group_leader",
    "admin",
})


def require_roles(*allowed_roles: str):
    """
    Create a FastAPI dependency that permits only the specified user roles.

    Authentication is handled by get_current_user.
    Authenticated users without an allowed role receive 403 Forbidden.

    Usage:
        admin_only = require_roles("admin")

        @app.get("/admin/example")
        def admin_example(
            current_user: dict = Depends(admin_only)
        ):
            return current_user
    """
    normalized_roles = {
        (
            role.value
            if hasattr(role, "value")
            else str(role)
        ).strip().lower()
        for role in allowed_roles
    }

    if not normalized_roles:
        raise ValueError(
            "At least one allowed role must be provided"
        )

    invalid_roles = (
        normalized_roles - VALID_USER_ROLES
    )

    if invalid_roles:
        invalid_list = ", ".join(
            sorted(invalid_roles)
        )

        raise ValueError(
            f"Unknown user role(s): {invalid_list}"
        )

    def role_dependency(
        current_user: dict = Depends(
            get_current_user
        )
    ) -> dict:
        current_role = str(
            current_user.get("role", "")
        ).strip().lower()

        if current_role not in normalized_roles:
            allowed_list = ", ".join(
                sorted(normalized_roles)
            )

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Access denied. Required role: "
                    f"{allowed_list}"
                ),
            )

        return current_user

    return role_dependency


# Reusable dependencies for common StudySync role combinations
require_admin = require_roles("admin")

require_group_leader_or_admin = require_roles(
    "group_leader",
    "admin",
)