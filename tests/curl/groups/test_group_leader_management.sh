#!/bin/bash
# ===========================================================================
# StudySynq - Group Leader Management Console Tests
# Covers:
# - US-B.4 Group Leader Management Console
#
# Run:
#   bash tests/curl/groups/test_group_leader_management.sh
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

json_get() {
  echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"
}

status_code() {
  echo "$1" | tr -d '\r' | awk -F'HTTP_STATUS:' '/HTTP_STATUS:/ {print $2}' | tail -1
}

body_only() {
  echo "$1" | sed '/HTTP_STATUS:/d'
}

leader_count() {
  echo "$1" | grep -o '"membership_role"[ ]*:[ ]*"leader"' | wc -l | tr -d ' '
}

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
echo "  GROUP LEADER MANAGEMENT TESTS"
echo "========================================"

OWNER_EMAIL="group_owner_${TS}@yorku.ca"
MEMBER_EMAIL="group_member_${TS}@yorku.ca"
TARGET_EMAIL="group_target_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
OWNER=$(reg "{\"name\":\"Group Owner\",\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
OT=$(json_get "$OWNER" access_token)

MEMBER=$(reg "{\"name\":\"Group Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)
MID=$(json_get "$MEMBER" user_id)

TARGET=$(reg "{\"name\":\"Group Target\",\"email\":\"$TARGET_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
TID=$(json_get "$TARGET" user_id)

print_result "Owner registered" "access_token" "$OWNER"
print_result "Member registered" "access_token" "$MEMBER"
print_result "Target registered" "access_token" "$TARGET"

if [ -z "$OT" ] || [ -z "$MT" ] || [ -z "$MID" ] || [ -z "$TID" ]; then
  echo "Setup failed because token or user id was missing."
  exit 1
fi

echo ""
echo "[ setup ] Create group and join member"
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OT" \
  -d "{\"name\":\"Group Management Test ${TS}\",\"is_public\":true}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "[ B4-1 ] Owner can view member roster"
ROSTER=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/members" \
  -H "Authorization: Bearer $OT")

check_status "Owner can access member roster" "$(status_code "$ROSTER")" "200"
print_result "Roster includes owner email" "$OWNER_EMAIL" "$(body_only "$ROSTER")"

echo ""
echo "[ B4-2 ] Search registered user"
SEARCH=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/members/search?q=$TARGET_EMAIL" \
  -H "Authorization: Bearer $OT")

check_status "Search request succeeds" "$(status_code "$SEARCH")" "200"
print_result "Search result includes target email" "$TARGET_EMAIL" "$(body_only "$SEARCH")"

echo ""
echo "[ B4-3 ] Add registered user as member"
ADD_TARGET=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OT" \
  -d "{\"user_email\":\"$TARGET_EMAIL\",\"membership_role\":\"member\"}")

check_status "Registered user added" "$(status_code "$ADD_TARGET")" "200" "201"
print_result "Add response contains target email" "$TARGET_EMAIL" "$(body_only "$ADD_TARGET")"

echo ""
echo "[ B4-4 ] Duplicate member is rejected"
DUP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OT" \
  -d "{\"user_email\":\"$TARGET_EMAIL\",\"membership_role\":\"member\"}")

check_status "Duplicate member rejected" "$(status_code "$DUP")" "400" "409"

echo ""
echo "[ B4-5 ] Unregistered email is rejected"
UNKNOWN=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OT" \
  -d "{\"user_email\":\"not_registered_${TS}@example.com\",\"membership_role\":\"member\"}")

check_status "Unregistered user rejected" "$(status_code "$UNKNOWN")" "400" "404"

echo ""
echo "[ B4-6 ] Remove normal member"
REMOVE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$BASE_URL/groups/$GID/members/$TID" \
  -H "Authorization: Bearer $OT")

check_status "Normal member removed" "$(status_code "$REMOVE")" "200" "204"

echo ""
echo "[ B4-7 ] Transfer ownership/leadership to another member"
TRANSFER=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PATCH "$BASE_URL/groups/$GID/owner" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OT" \
  -d "{\"user_id\":\"$MID\"}")

check_status "Ownership transfer succeeds" "$(status_code "$TRANSFER")" "200"
print_result "Transfer response confirms new owner" "$MID" "$(body_only "$TRANSFER")"

echo ""
echo "[ B4-8 ] Verify only one leader remains"
AFTER=$(curl -s -X GET "$BASE_URL/groups/$GID/members" \
  -H "Authorization: Bearer $MT")

COUNT=$(leader_count "$AFTER")
if [ "$COUNT" = "1" ]; then
  echo "  PASS - Only one leader remains"; PASS=$((PASS+1))
else
  echo "  FAIL - Only one leader remains"
  echo "     Expected: 1 leader"
  echo "     Got: $COUNT leaders"
  echo "$AFTER"
  FAIL=$((FAIL+1))
fi

print_result "New leader appears in roster" "$MEMBER_EMAIL" "$AFTER"

echo ""
echo "[ B4-9 ] Previous owner is blocked from leader-only action after transfer"
OLD_OWNER_ADD=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OT" \
  -d "{\"user_email\":\"$TARGET_EMAIL\",\"membership_role\":\"member\"}")

check_status "Previous owner no longer has leader controls" "$(status_code "$OLD_OWNER_ADD")" "401" "403"

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0