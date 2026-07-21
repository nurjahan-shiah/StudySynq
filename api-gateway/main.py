"""
api-gateway/main.py
API Gateway for StudySync microservices.
Single entry point (port 8000) that routes requests to individual services.
Frontend connects only to this gateway.

Service URLs (internal to Docker network):
- auth-service: http://auth-service:8001
- users-service: http://users-service:8002
- groups-service: http://groups-service:8003
- sessions-service: http://sessions-service:8004
- resources-service: http://resources-service:8005
- courses-service: http://courses-service:8006
- admin-service: http://admin-service:8007
- recommendations-service: http://recommendations-service:8008
- notifications-service: http://notifications-service:8009
- announcements-service: http://announcements-service:8010
- tasks-service: http://tasks-service:8011
"""

import os
import re
import time
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from jose import JWTError, jwt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api-gateway")

# ============================================================================
# Configuration
# ============================================================================

SERVICE_URLS = {
    "auth": "http://auth-service:8001",
    "users": "http://users-service:8002",
    "groups": "http://groups-service:8003",
    "sessions": "http://sessions-service:8004",
    "resources": "http://resources-service:8005",
    "courses": "http://courses-service:8006",
    "admin": "http://admin-service:8007",
    "recommendations": "http://recommendations-service:8008",
    "notifications": "http://notifications-service:8009",
    "announcements": "http://announcements-service:8010",
    "tasks": "http://tasks-service:8011",
}

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "your-secret-key-change-in-production",
)

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256",
)

# Routes that do not require authentication.
PUBLIC_ROUTES = {
    "/auth/register",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/auth/health",
    "/",
    "/docs",
    "/openapi.json",
    "/health/services",
}

# Routes grouped by service.
ROUTE_MAPPING = {
    "/auth": "auth",
    "/users": "users",
    "/groups": "groups",
    "/sessions": "sessions",
    "/resources": "resources",
    "/courses": "courses",
    "/admin": "admin",
    "/recommendations": "recommendations",
    "/notifications": "notifications",
    "/notification-preferences": "notifications",
    "/announcements": "announcements",
    "/tasks": "tasks",
}

# ============================================================================
# Lifespan
# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup and shutdown logic."""
    print("API Gateway starting...")
    print(f"Service URLs: {SERVICE_URLS}")
    yield
    print("API Gateway shutting down...")


app = FastAPI(
    title="StudySync API Gateway",
    description="Routes requests to StudySync microservices",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Helper Functions
# ============================================================================


def validate_access_token(
    authorization: str | None,
) -> dict:
    """
    Validate a Bearer access token for a protected route.

    Returns the authenticated user's ID, email, and role.
    Raises HTTPException when the authorization header or token is invalid.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, separator, token = authorization.partition(" ")

    if (
        not separator
        or scheme.lower() != "bearer"
        or not token.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token.strip(),
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        user_id = payload.get("user_id") or payload.get("sub")
        email = payload.get("email")
        role = payload.get("role")

        if not user_id or not email or not role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return {
            "user_id": str(user_id),
            "email": str(email),
            "role": str(role),
        }

    except JWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error


def get_service_for_route(path: str) -> str:
    """
    Determine which service handles a route.

    Specific nested routes take priority over generic prefix matching.
    """

    # /groups/{id}/resources[/*] -> resources-service
    if re.match(
        r"^/groups/[^/]+/resources(/.*)?$",
        path,
    ):
        return "resources"

    # /groups/{id}/sessions[/*] -> sessions-service
    if re.match(
        r"^/groups/[^/]+/sessions(/.*)?$",
        path,
    ):
        return "sessions"

    # /groups/{id}/announcements[/*] -> announcements-service
    if re.match(
        r"^/groups/[^/]+/announcements(/.*)?$",
        path,
    ):
        return "announcements"

    # /groups/{id}/tasks[/*] -> tasks-service
    if re.match(
        r"^/groups/[^/]+/tasks(/.*)?$",
        path,
    ):
        return "tasks"

    for route_prefix, service in ROUTE_MAPPING.items():
        if (
            path == route_prefix
            or path.startswith(f"{route_prefix}/")
        ):
            return service

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Route not found",
    )


async def forward_request(
    service: str,
    method: str,
    path: str,
    request: Request,
    body: bytes | None = None,
    authenticated_user: dict | None = None,
) -> dict:
    """Forward an HTTP request to a microservice."""
    service_url = SERVICE_URLS.get(service)

    if not service_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Service {service} not configured",
        )

    target_url = f"{service_url}{path}"

    headers = dict(request.headers)
    headers.pop("host", None)

    # Remove client-supplied identity headers to prevent spoofing.
    headers.pop("x-user-id", None)
    headers.pop("x-user-email", None)
    headers.pop("x-user-role", None)

    # Add identity headers only after the JWT has been validated.
    if authenticated_user:
        headers["X-User-ID"] = authenticated_user["user_id"]
        headers["X-User-Email"] = authenticated_user["email"]
        headers["X-User-Role"] = authenticated_user["role"]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=target_url,
                headers=headers,
                content=body,
                params=request.query_params,
            )

            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "content": response.content,
            }

    except httpx.ConnectError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service {service} is unavailable",
        ) from error

    except httpx.TimeoutException as error:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Service {service} timeout",
        ) from error

    except Exception as error:
        print(f"Error forwarding to {service}: {error}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal gateway error",
        ) from error


# ============================================================================
# Routes
# ============================================================================


@app.get("/")
async def health():
    """Return the API Gateway health status."""
    return {
        "status": "ok",
        "service": "api-gateway",
        "services": list(SERVICE_URLS.keys()),
    }
SERVICE_HEALTH_URLS = {
    "auth":            "http://auth-service:8001/auth/health",
    "users":           "http://users-service:8002/users/health",
    "groups":          "http://groups-service:8003/groups/health",
    "sessions":        "http://sessions-service:8004/sessions/health",
    "resources":       "http://resources-service:8005/resources/health",
    "courses":         "http://courses-service:8006/courses/health",
    "admin":           "http://admin-service:8007/admin/health",
    "recommendations": "http://recommendations-service:8008/recommendations/health",
    "notifications":   "http://notifications-service:8009/notifications/health",
    "announcements":   "http://announcements-service:8010/announcements/health",
}

@app.get("/health/services")
async def get_all_service_health():
    """US-A.5 — Returns live health status of every microservice."""
    results = {}
    async with httpx.AsyncClient() as client:
        for name, url in SERVICE_HEALTH_URLS.items():
            start = time.time()
            try:
                resp = await client.get(url, timeout=3.0)
                elapsed = round((time.time() - start) * 1000)
                results[name] = {
                    "status": "ok" if resp.status_code == 200 else "degraded",
                    "status_code": resp.status_code,
                    "response_ms": elapsed,
                }
                logger.info(f"Health check {name}: {resp.status_code} in {elapsed}ms")
            except Exception as e:
                elapsed = round((time.time() - start) * 1000)
                results[name] = {
                    "status": "down",
                    "status_code": None,
                    "response_ms": elapsed,
                    "error": str(e),
                }
                logger.error(f"Health check {name} failed: {e}")
    return {
        "services": results,
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

@app.api_route(
    "/{path:path}",
    methods=[
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
    ],
)
async def gateway(
    path: str,
    request: Request,
):
    """
    Accept requests and forward them to the appropriate microservice.

    Flow:
    1. Determine which service handles the route.
    2. Validate authentication for protected routes.
    3. Forward the request to the service.
    4. Return the service response to the client.
    """
    full_path = f"/{path}"

    try:
        service = get_service_for_route(full_path)

    except HTTPException as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        ) from error

    authenticated_user = None

    if full_path not in PUBLIC_ROUTES:
        authenticated_user = validate_access_token(
            request.headers.get("authorization"),
        )

    body = (
        await request.body()
        if request.method != "GET"
        else None
    )

    response = await forward_request(
        service=service,
        method=request.method,
        path=full_path,
        request=request,
        body=body,
        authenticated_user=authenticated_user,
    )

    excluded_headers = {
        "transfer-encoding",
        "content-encoding",
        "content-length",
        "content-type",
        "date",
        "server",
    }

    headers = {
        key: value
        for key, value in response["headers"].items()
        if key.lower() not in excluded_headers
    }

    return Response(
        status_code=response["status_code"],
        content=response["content"],
        media_type=response["headers"].get(
            "content-type",
            "application/json",
        ),
        headers=headers,
    )


# ============================================================================
# Error Handlers
# ============================================================================


@app.exception_handler(HTTPException)
async def http_exception_handler(
    request: Request,
    exc: HTTPException,
):
    """Return HTTP exceptions as JSON responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
    )