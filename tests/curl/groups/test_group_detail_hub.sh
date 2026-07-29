#!/bin/bash
# ===========================================================================
# StudySynq - Group Detail Hub Tests
# Covers:
# - US-B.5 Group Detail Hub
# @author: Fahad Sohail
#
# Run:
#   bash tests/curl/groups/test_group_detail_hub.sh
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

json_get_num() {
  echo "$1" | grep -o "\"$2\":[ ]*[0-9]*" | head -1 | sed "s/.*:[ ]*//"
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
echo "  GROUP DETAIL HUB TESTS (US-B.5)"
echo "========================================"

LEADER_EMAIL="hub_leader_${TS}@yorku.ca"
MEMBER_EMAIL="hub_member_${TS}@yorku.ca"
OUTSIDER_EMAIL="hub_outsider_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
LEADER=$(reg "{\"name\":\"Hub Leader\",\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

MEMBER=$(reg "{\"name\":\"Hub Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)

OUTSIDER=$(reg "{\"name\":\"Hub Outsider\",\"email\":\"$OUTSIDER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
OTK=$(json_get "$OUTSIDER" access_token)

print_result "Leader registered" "access_token" "$LEADER"
print_result "Member registered" "access_token" "$MEMBER"
print_result "Outsider registered" "access_token" "$OUTSIDER"

if [ -z "$LT" ] || [ -z "$MT" ] || [ -z "$OTK" ]; then
  echo "Setup failed because a token was missing."
  exit 1
fi

echo ""
echo "[ setup ] Create group with description, session and section"
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Hub Test Group ${TS}\",\"description\":\"Weekly EECS 4314 study group\",\"is_public\":true,\"session\":\"SU26\",\"section\":\"A\"}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "[ B5-1 ] Detail hub returns core overview fields"
DETAIL=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID" \
  -H "Authorization: Bearer $LT")

check_status "Leader can load group detail hub" "$(status_code "$DETAIL")" "200"
DETAIL_BODY=$(body_only "$DETAIL")
print_result "Hub includes group name" "Hub Test Group ${TS}" "$DETAIL_BODY"
print_result "Hub includes description" "Weekly EECS 4314 study group" "$DETAIL_BODY"
print_result "Hub includes session term" "SU26" "$DETAIL_BODY"
print_result "Hub includes section" "\"section\":\"A\"" "$DETAIL_BODY"
print_result "Hub includes created_by" "created_by" "$DETAIL_BODY"
print_result "Hub includes created_at" "created_at" "$DETAIL_BODY"

echo ""
echo "[ B5-2 ] Member count reflects joined members"
COUNT=$(json_get_num "$DETAIL_BODY" member_count)
if [ "$COUNT" = "2" ]; then
  echo "  PASS - member_count is 2 (leader + joined member)"; PASS=$((PASS+1))
else
  echo "  FAIL - member_count is 2 (leader + joined member)"
  echo "     Got: $COUNT"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ B5-3 ] Non-member can still view the public detail hub"
OUTSIDER_VIEW=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID" \
  -H "Authorization: Bearer $OTK")

check_status "Outsider can view group detail hub" "$(status_code "$OUTSIDER_VIEW")" "200"
print_result "Outsider view still shows group name" "Hub Test Group ${TS}" "$(body_only "$OUTSIDER_VIEW")"

echo ""
echo "[ B5-4 ] Unauthenticated request is rejected"
NO_AUTH=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID")
check_status "Unauthenticated request rejected" "$(status_code "$NO_AUTH")" "401" "403"

echo ""
echo "[ B5-5 ] Non-existent group returns 404"
MISSING=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $LT")
check_status "Missing group returns 404" "$(status_code "$MISSING")" "404"

echo ""
echo "[ B5-6 ] Detail hub reflects linked courses"
ADMIN_EMAIL="hub_admin_${TS}@yorku.ca"
ADMIN=$(reg "{\"name\":\"Hub Admin\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"admin\"}")
AT=$(json_get "$ADMIN" access_token)
print_result "Admin registered" "access_token" "$ADMIN"

COURSE_CODE="ZZ ${TS: -4}"
COURSE=$(curl -s -X POST "$BASE_URL/admin/courses" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" \
  -d "{\"course_code\":\"$COURSE_CODE\",\"course_name\":\"Hub Linkage Test Course\",\"department\":\"EECS\"}")
CID=$(json_get "$COURSE" id)
print_result "Course created" "$COURSE_CODE" "$COURSE"

if [ -z "$CID" ]; then
  echo "  FAIL - Missing course id, cannot verify course linkage"
  FAIL=$((FAIL+1))
else
  COURSE_GROUP=$(curl -s -X POST "$BASE_URL/groups" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $LT" \
    -d "{\"name\":\"Hub Course-Linked Group ${TS}\",\"is_public\":true,\"course_ids\":[\"$CID\"]}")
  CGID=$(json_get "$COURSE_GROUP" id)
  print_result "Course-linked group created" "id" "$COURSE_GROUP"

  COURSE_HUB=$(curl -s -X GET "$BASE_URL/groups/$CGID" -H "Authorization: Bearer $LT")
  print_result "Hub course_codes includes linked course" "$COURSE_CODE" "$COURSE_HUB"
  print_result "Hub courses array includes course name" "Hub Linkage Test Course" "$COURSE_HUB"
fi

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
