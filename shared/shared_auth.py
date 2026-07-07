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
from fastapi import HTTPException, status

# ============================================================================
# Configuration
# ============================================================================

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8h — covers a work/demo session (was 30m)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ============================================================================
# Password Utilities
# ============================================================================

def hash_password(password: str) -> str:
    """Hash a plaintext password."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)

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
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(user_id),
        "email": user_email,
        "role": user_role,
        "exp": expire
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
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
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")
        
        if user_id is None or email is None or role is None:
            raise credentials_exception
        
        return {
            "user_id": UUID(user_id),
            "email": email,
            "role": role
        }
    except JWTError:
        raise credentials_exception

# ============================================================================
# FastAPI Dependencies
# ============================================================================

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    FastAPI dependency for protected routes.
    Validates JWT token and returns user info.
    
    Usage:
        @app.get("/protected")
        def protected_route(user = Depends(get_current_user)):
            return {"user_id": user["user_id"]}
    """
    token = credentials.credentials
    return decode_token(token)