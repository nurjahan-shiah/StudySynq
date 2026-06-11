"""
services/auth-service/main.py
Authentication Service
- User registration
- User login (returns JWT token)
- Token validation (used by other services via HTTP calls)

Runs on port 8001
"""

from uuid import uuid4
from fastapi import FastAPI, HTTPException, status, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr
from contextlib import asynccontextmanager

# Import shared utilities
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
    
    Returns JWT token on success (auto-login).
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    new_user = User(
        id=uuid4(),
        name=user_data.name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=UserRole.STUDENT
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
    
    # Generate JWT token
    access_token = create_access_token(
        user_id=new_user.id,
        user_email=new_user.email,
        user_role=new_user.role.value
    )
    
    return TokenResponse(
        access_token=access_token,
        user_id=new_user.id,
        user_email=new_user.email
    )

@app.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user and return JWT token.
    """
    # Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Generate JWT token
    access_token = create_access_token(
        user_id=user.id,
        user_email=user.email,
        user_role=user.role.value
    )
    
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        user_email=user.email
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