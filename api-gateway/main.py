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
"""

import httpx
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

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
}

# Routes that don't require authentication
PUBLIC_ROUTES = {
    "/auth/register",
    "/auth/login",
    "/",
    "/docs",
    "/openapi.json",
}

# Routes grouped by service
ROUTE_MAPPING = {
    "/auth": "auth",
    "/users": "users",
    "/groups": "groups",
    "/sessions": "sessions",
    "/resources": "resources",
    "/courses": "courses",
    "/admin": "admin",
    "/recommendations": "recommendations",
}

# ============================================================================
# Lifespan
# ============================================================================

async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    print("🚀 API Gateway starting...")
    print(f"Service URLs: {SERVICE_URLS}")
    yield
    print("🛑 API Gateway shutting down...")

app = FastAPI(
    title="StudySync API Gateway",
    description="Routes requests to StudySync microservices",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Helper Functions
# ============================================================================

def get_service_for_route(path: str) -> str:
    """
    Determine which service handles this route.
    Example: /groups/123 → "groups"
    Specific sub-paths take priority over the generic prefix match.
    """
    import re
    # /groups/{id}/resources[/*] → resources-service
    if re.match(r"^/groups/[^/]+/resources(/.*)?$", path):
        return "resources"
    for route_prefix, service in ROUTE_MAPPING.items():
        if path.startswith(route_prefix):
            return service
    raise HTTPException(status_code=404, detail="Route not found")

async def forward_request(
    service: str,
    method: str,
    path: str,
    request: Request,
    body: bytes = None
) -> dict:
    """
    Forward HTTP request to a microservice and return response.
    """
    service_url = SERVICE_URLS.get(service)
    if not service_url:
        raise HTTPException(status_code=500, detail=f"Service {service} not configured")

    # Build full URL to forward
    target_url = f"{service_url}{path}"
    
    # Prepare headers (forward auth header if present)
    headers = dict(request.headers)
    headers.pop("host", None)  # Remove host header (service will set its own)
    
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
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Service {service} is unavailable"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Service {service} timeout"
        )
    except Exception as e:
        print(f"Error forwarding to {service}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal gateway error"
        )

# ============================================================================
# Routes
# ============================================================================

@app.get("/")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "api-gateway",
        "services": list(SERVICE_URLS.keys())
    }

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def gateway(path: str, request: Request):
    """
    Main gateway route: accepts all HTTP methods and forwards to appropriate service.
    
    Flow:
    1. Determine which service handles this route
    2. Check if authentication is required
    3. Forward request to service
    4. Return response back to client
    """
    
    # Full path with query string
    full_path = f"/{path}"
    if request.query_params:
        full_path += f"?{request.query_params}"
    
    # Get service for this route
    try:
        service = get_service_for_route(f"/{path}")
    except HTTPException:
        # If no service found, return 404
        raise HTTPException(status_code=404, detail="Endpoint not found")
    
    # Check if route requires authentication
    if full_path not in PUBLIC_ROUTES and not any(
        full_path.startswith(pr) for pr in PUBLIC_ROUTES
    ):
        # Most routes require auth - check for Bearer token
        auth_header = request.headers.get("authorization")
        if not auth_header:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    # Read request body if present
    body = await request.body() if request.method != "GET" else None
    
    # Forward request to service
    response = await forward_request(
        service=service,
        method=request.method,
        path=f"/{path}",
        request=request,
        body=body
    )
    
    # Return response to client — proxy bytes directly to avoid re-serialization errors
    excluded_headers = {"transfer-encoding", "content-encoding", "content-length"}
    headers = {k: v for k, v in response["headers"].items() if k.lower() not in excluded_headers}
    return Response(
        status_code=response["status_code"],
        content=response["content"],
        media_type=response["headers"].get("content-type", "application/json"),
        headers=headers,
    )

# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)