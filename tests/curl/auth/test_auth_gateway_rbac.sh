#!/bin/bash
# ===========================================================================
# StudySynq - Auth, RBAC, and API Gateway Tests
# Covers: US-A.2, US-A.3, US-A.4
# Run: bash tests/curl/auth/test_auth_gateway_rbac.sh
# ===========================================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0
TS=$(date +%s)

print_result() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS - $label"; PASS=$((PASS+1))
  else
    echo "  FAIL - $label"
    echo "     Expected to contain: $expected"
    echo "     Got: $actual"
    FAIL=$((FAIL+1))
  fi
}

check_status() {
  local label="$1" actual="$2"
  shift 2
  for expected in "$@"; do
    if [ "$actual" = "$expected" ]; then
      echo "  PASS - $label"; PASS=$((PASS+1)); return
    fi
  done
  echo "  FAIL - $label"
  echo "     Expected status: $*"
  echo "     Got status: $actual"
  FAIL=$((FAIL+1))
}

json_get() { echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"; }
status_code() { echo "$1" | tr -d '\r' | awk -F'HTTP_STATUS:' '/HTTP_STATUS:/ {print $2}' | tail -1; }
body_only() { echo "$1" | sed '/HTTP_STATUS:/d'; }

reg() {
  local body="$1" resp
  for _ in $(seq 1 6); do
    resp=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" -d "$body")
    echo "$resp" | grep -qi "too many" || { echo "$resp"; return; }
    sleep 20
  done
  echo "$resp"
}

echo ""
echo "========================================"
echo "  AUTH, RBAC, AND GATEWAY TESTS"
echo "========================================"

LEADER_EMAIL="auth_leader_${TS}@yorku.ca"
MEMBER_EMAIL="auth_member_${TS}@yorku.ca"
TARGET_EMAIL="auth_target_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
LEADER=$(reg "{\"name\":\"Auth Leader\",\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

MEMBER=$(reg "{\"name\":\"Auth Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)

TARGET=$(reg "{\"name\":\"Auth Target\",\"email\":\"$TARGET_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")

print_result "Leader registered" "access_token" "$LEADER"
print_result "Member registered" "access_token" "$MEMBER"
print_result "Target registered" "access_token" "$TARGET"

GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Auth RBAC Group ${TS}\",\"is_public\":true}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "[ US-A.2 ] Valid login"
LOGIN_OK=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\"}")

check_status "Valid login returns success" "$(status_code "$LOGIN_OK")" "200"
print_result "Valid login returns token" "access_token" "$(body_only "$LOGIN_OK")"

echo ""
echo "[ US-A.2 ] Invalid login"
LOGIN_BAD=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LEADER_EMAIL\",\"password\":\"wrong-password\"}")

check_status "Invalid login is rejected" "$(status_code "$LOGIN_BAD")" "400" "401" "403"

echo ""
echo "[ US-A.4 ] Protected route without token"
NO_TOKEN=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/members")
check_status "Gateway blocks missing token" "$(status_code "$NO_TOKEN")" "401" "403"

echo ""
echo "[ US-A.4 ] Protected route with valid token"
WITH_TOKEN=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/members" \
  -H "Authorization: Bearer $MT")

check_status "Gateway allows valid token" "$(status_code "$WITH_TOKEN")" "200"
print_result "Protected response contains member email" "$MEMBER_EMAIL" "$(body_only "$WITH_TOKEN")"

echo ""
echo "[ US-A.3 ] Regular member cannot perform leader-only member management"
MEMBER_ADD=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" \
  -d "{\"user_email\":\"$TARGET_EMAIL\",\"membership_role\":\"member\"}")

check_status "Regular member is blocked" "$(status_code "$MEMBER_ADD")" "401" "403"

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
