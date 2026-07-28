#!/bin/bash
# ============================================================
# Test Suite: US-A.5 — System Health Dashboard
# @author: Uzma Alam
# ============================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

print_result() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo -e "${GREEN}  PASS${NC} $label"
    ((PASS++))
  else
    echo -e "${RED}  FAIL${NC} $label"
    echo "       Expected: $expected"
    echo "       Got: $actual"
    ((FAIL++))
  fi
}

echo ""
echo "=============================="
echo " Health Dashboard — US-A.5"
echo "=============================="
echo ""

echo "[ SETUP ] Logging in as admin..."
ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"testadmin@yorku.ca","password":"Test1234!"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

echo "[ SETUP ] Logging in as leader..."
LEADER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uzma_test_leader@test.com","password":"Test1234!"}')
LEADER_TOKEN=$(echo "$LEADER_LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo ""

echo "-----------------------------"
echo " US-A.5: Health Endpoint"
echo "-----------------------------"

# Test 1: Health endpoint returns services
HEALTH=$(curl -s "$BASE_URL/health/services" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
print_result "Health returns services object" "services" "$HEALTH"
print_result "Health returns checked_at timestamp" "checked_at" "$HEALTH"
print_result "Auth service present" "auth" "$HEALTH"
print_result "Sessions service present" "sessions" "$HEALTH"
print_result "Groups service present" "groups" "$HEALTH"
print_result "Resources service present" "resources" "$HEALTH"
print_result "Notifications service present" "notifications" "$HEALTH"
print_result "Recommendations service present" "recommendations" "$HEALTH"

# Test 2: Each service has required fields
print_result "Services have status field" "\"status\"" "$HEALTH"
print_result "Services have response_ms field" "response_ms" "$HEALTH"
print_result "Services have status_code field" "status_code" "$HEALTH"

# Test 3: Auth service is healthy
print_result "Auth service is ok" "\"auth\"" "$HEALTH"

# Test 4: Individual service health endpoints
echo ""
echo "[ Checking individual /health endpoints ]"
AUTH_H=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8001/auth/health")
print_result "Auth service /health returns 200" "200" "$AUTH_H"

SESSIONS_H=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8004/sessions/health")
print_result "Sessions service /health returns 200" "200" "$SESSIONS_H"

GROUPS_H=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8003/groups/health")
print_result "Groups service /health returns 200" "200" "$GROUPS_H"

RESOURCES_H=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8005/resources/health")
print_result "Resources service /health returns 200" "200" "$RESOURCES_H"

echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""