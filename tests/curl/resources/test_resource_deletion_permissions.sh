#!/bin/bash
# ===========================================================================
# StudySynq - Resource Deletion Permission Tests
# Covers:
# - US-D.4 Permission-Controlled Resource Deletion
#
# Run:
#   bash tests/curl/resources/test_resource_deletion_permissions.sh
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
echo "  RESOURCE DELETION PERMISSION TESTS"
echo "========================================"

LEADER_EMAIL="resource_leader_${TS}@yorku.ca"
MEMBER_EMAIL="resource_member_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
LEADER=$(reg "{\"name\":\"Resource Leader\",\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

MEMBER=$(reg "{\"name\":\"Resource Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)

print_result "Leader registered" "access_token" "$LEADER"
print_result "Member registered" "access_token" "$MEMBER"

echo ""
echo "[ setup ] Create group and join member"
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Resource Delete Test ${TS}\",\"is_public\":true}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "[ D4-1 ] Leader uploads resource"
RESOURCE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/resources?file_name=leader-notes-${TS}.pdf&file_url=https://example.com/leader-notes-${TS}.pdf&file_type=link" \
  -H "Authorization: Bearer $LT")

RESOURCE_BODY=$(body_only "$RESOURCE")
RID=$(json_get "$RESOURCE_BODY" id)

check_status "Leader upload handled" "$(status_code "$RESOURCE")" "200" "201"
print_result "Upload response includes file name" "leader-notes-${TS}" "$RESOURCE_BODY"

echo ""
echo "[ D4-2 ] Normal member cannot delete leader's resource"
if [ -n "$RID" ]; then
  MEMBER_DELETE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$BASE_URL/resources/$RID" \
    -H "Authorization: Bearer $MT")

  check_status "Member blocked from deleting another user's resource" "$(status_code "$MEMBER_DELETE")" "401" "403"
else
  echo "  FAIL - Missing resource id for unauthorized delete test"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ D4-3 ] Leader can delete resource"
if [ -n "$RID" ]; then
  LEADER_DELETE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$BASE_URL/resources/$RID" \
    -H "Authorization: Bearer $LT")

  check_status "Leader can delete resource" "$(status_code "$LEADER_DELETE")" "200" "204"
else
  echo "  FAIL - Missing resource id for leader delete test"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ D4-4 ] Uploader can delete own resource"
MEMBER_RESOURCE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/resources?file_name=member-notes-${TS}.pdf&file_url=https://example.com/member-notes-${TS}.pdf&file_type=link" \
  -H "Authorization: Bearer $MT")

MEMBER_RESOURCE_BODY=$(body_only "$MEMBER_RESOURCE")
MRID=$(json_get "$MEMBER_RESOURCE_BODY" id)

check_status "Member upload handled" "$(status_code "$MEMBER_RESOURCE")" "200" "201"

if [ -n "$MRID" ]; then
  MEMBER_DELETE_OWN=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE "$BASE_URL/resources/$MRID" \
    -H "Authorization: Bearer $MT")

  check_status "Uploader can delete own resource" "$(status_code "$MEMBER_DELETE_OWN")" "200" "204"
else
  echo "  FAIL - Missing member resource id"
  FAIL=$((FAIL+1))
fi

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0