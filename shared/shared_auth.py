"""
shared/auth.py
JWT token generation and verification used across all microservices.
Centralized so token format is consistent everywhere.
"""

import os
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jose import JWTError, jwt
from passlib.context import CryptContext

# ============================================================================
# Configuration
# ============================================================================

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "your-secret-key-change-in-production",
)

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256",
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "480",
    )
)

REFRESH_TOKEN_EXPIRE_DAYS = int(
    os.getenv(
        "REFRESH_TOKEN_EXPIRE_DAYS",
        "7",
    )
)

# Password hashing context
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

# ============================================================================
# Password Utilities
# ============================================================================


def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """Verify a plaintext password against a hash."""
    return pwd_context.verify(
        plain_password,
        hashed_password,
    )


# ============================================================================
# JWT Utilities
# ============================================================================


def create_access_token(
    user_id: UUID,
    user_email: str,
    user_role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create an access JWT token for a user.

    The token payload includes the user ID, email, role,
    token type, and expiration time.
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        )

    to_encode = {
        "sub": str(user_id),
        "email": user_email,
        "role": user_role,
        "type": "access",
        "exp": expire,
    }

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def create_refresh_token(
    user_id: UUID,
    user_email: str,
    user_role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a refresh JWT token for a user.

    Refresh tokens live longer than access tokens and are
    used to request a new access token.
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            days=REFRESH_TOKEN_EXPIRE_DAYS,
        )

    to_encode = {
        "sub": str(user_id),
        "email": user_email,
        "role": user_role,
        "type": "refresh",
        "exp": expire,
    }

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _decode_token(
    token: str,
    expected_type: str,
) -> dict:
    """
    Decode and validate an access or refresh JWT token.

    Verifies that the token contains the required user claims
    and matches the expected token type.
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
            algorithms=[ALGORITHM],
        )

        user_id = (
            payload.get("user_id")
            or payload.get("sub")
        )
        email = payload.get("email")
        role = payload.get("role")
        token_type = payload.get("type")

        if (
            user_id is None
            or email is None
            or role is None
        ):
            raise credentials_exception

        # Older access tokens may not contain a type claim.
        # They remain valid until they naturally expire.
        if expected_type == "access":
            if token_type not in (None, "access"):
                raise credentials_exception
        elif token_type != expected_type:
            raise credentials_exception

        return {
            "user_id": UUID(str(user_id)),
            "email": str(email),
            "role": str(role),
            "type": token_type or expected_type,
        }

    except HTTPException:
        raise

    except (JWTError, ValueError, TypeError) as error:
        raise credentials_exception from error


def decode_token(token: str) -> dict:
    """
    Decode and validate an access JWT token.

    Returns the authenticated user's token information.
    """
    return _decode_token(
        token,
        expected_type="access",
    )


def decode_refresh_token(token: str) -> dict:
    """
    Decode and validate a refresh JWT token.

    Returns token information when the token is valid and
    has the refresh-token type.
    """
    return _decode_token(
        token,
        expected_type="refresh",
    )


# ============================================================================
# FastAPI Dependencies
# ============================================================================

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[
        HTTPAuthorizationCredentials
    ] = Depends(security),
) -> dict:
    """
    FastAPI dependency for protected routes.

    Validates the access token and returns authenticated
    user information.

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
    "admin",
})


def require_roles(*allowed_roles: str):
    """
    Create a dependency that permits only specified roles.

    Authentication is handled by get_current_user.
    Authenticated users without an allowed role receive
    403 Forbidden.

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
            "At least one allowed role must be provided",
        )

    invalid_roles = (
        normalized_roles - VALID_USER_ROLES
    )

    if invalid_roles:
        invalid_list = ", ".join(
            sorted(invalid_roles),
        )

        raise ValueError(
            f"Unknown user role(s): {invalid_list}",
        )

    def role_dependency(
        current_user: dict = Depends(
            get_current_user,
        ),
    ) -> dict:
        current_role = str(
            current_user.get("role", ""),
        ).strip().lower()

        if current_role not in normalized_roles:
            allowed_list = ", ".join(
                sorted(normalized_roles),
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