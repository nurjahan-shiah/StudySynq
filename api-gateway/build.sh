#!/usr/bin/env bash
# StudySync — build + bring up all services
# Usage:
#   ./build.sh          # build all, start everything
#   ./build.sh --clean  # prune old images first, then build all
#   ./build.sh admin    # rebuild only admin + auth + frontend
set -euo pipefail

COMPOSE="docker compose -f docker-compose-microservices.yml"

case "${1:-}" in
  --clean)
    echo "🧹  Pruning dangling images..."
    docker image prune -f
    echo "🔨  Building all services (no cache)..."
    $COMPOSE build --no-cache
    ;;
  admin)
    echo "🔨  Rebuilding admin-service, auth-service, frontend..."
    $COMPOSE build --no-cache admin-service auth-service frontend
    echo "♻️   Restarting affected containers..."
    $COMPOSE up -d --no-deps admin-service auth-service frontend
    echo "✅  Done. Tailing logs (Ctrl-C to stop)..."
    $COMPOSE logs -f admin-service auth-service frontend
    exit 0
    ;;
  *)
    echo "🔨  Building all services..."
    $COMPOSE build
    ;;
esac

echo ""
echo "🚀  Starting all services..."
$COMPOSE up -d

echo ""
echo "⏳  Waiting for DB to be healthy..."
until docker inspect --format='{{.State.Health.Status}}' studysync-db 2>/dev/null | grep -q "healthy"; do
  printf "."
  sleep 2
done
echo " ready."

echo ""
echo "📋  Service status:"
$COMPOSE ps

echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  StudySync is up                                │"
echo "│                                                 │"
echo "│  Frontend      →  http://localhost:3000         │"
echo "│  Admin console →  http://localhost:3000/admin   │"
echo "│  API gateway   →  http://localhost:8000         │"
echo "│  API docs      →  http://localhost:8000/docs    │"
echo "│  Admin service →  http://localhost:8007/docs    │"
echo "└─────────────────────────────────────────────────┘"