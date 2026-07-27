#!/bin/bash
# ===========================================================================
# StudySync - Notification Centre Tests (US-E.1)
# Exercises the end-to-end flow:
#   register leader + member -> create group -> member joins ->
#   leader schedules session -> member receives a notification ->
#   unread-count / mark-read / mark-all-read / ownership (403)
# Run: bash tests/curl/notifications/test_notifications.sh
# ===========================================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0
TS=$(date +%s)   # unique suffix so the script is re-runnable

print_result() {
  local label=$1
  local expected=$2
  local actual=$3
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ PASS — $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ FAIL — $label"
    echo "     Expected to contain: $expected"
    echo "     Got: $actual"
    FAIL=$((FAIL+1))
  fi
}

# Extract a top-level string field, e.g. json_get "$RES" access_token
json_get() {
  echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"
}

echo ""
echo "=============================="
echo "  NOTIFICATION CENTRE TESTS"
echo "=============================="

# ---------------------------------------------------------------------------
# Setup: register a group leader and a member
# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Register leader + member"

LEADER_RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Notif Leader\",\"email\":\"notif_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LEADER_TOKEN=$(json_get "$LEADER_RES" access_token)

MEMBER_RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Notif Member\",\"email\":\"notif_member_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
MEMBER_TOKEN=$(json_get "$MEMBER_RES" access_token)
MEMBER_ID=$(json_get "$MEMBER_RES" user_id)
LEADER_ID=$(json_get "$LEADER_RES" user_id)

print_result "Leader registered" "access_token" "$LEADER_RES"
print_result "Member registered" "access_token" "$MEMBER_RES"

# ---------------------------------------------------------------------------
# Leader creates a group, member joins
# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Create group + member joins"

GROUP_RES=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d "{\"name\":\"Notif Test Group ${TS}\",\"description\":\"E.1 test\",\"is_public\":true}")
GROUP_ID=$(json_get "$GROUP_RES" id)
print_result "Group created" "id" "$GROUP_RES"

JOIN_RES=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/join" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
echo "  (member join response: $JOIN_RES)"

# ---------------------------------------------------------------------------
# Test 1: Leader schedules a session -> member gets a notification
# ---------------------------------------------------------------------------
echo ""
echo "[ 1 ] Leader schedules a session (triggers notification)"
SESSION_RES=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d "{\"title\":\"Algorithms Review\",\"scheduled_at\":\"2030-01-01T10:00:00\",\"location\":\"Library\",\"description\":\"Bring notes\"}")
print_result "Session created" "Algorithms Review" "$SESSION_RES"

# ---------------------------------------------------------------------------
# Test 2: Member sees the session notification
# ---------------------------------------------------------------------------
echo ""
echo "[ 2 ] Member lists notifications"
LIST_RES=$(curl -s -X GET "$BASE_URL/notifications/$MEMBER_ID" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "Has a session notification" "\"type\":\"session\"" "$LIST_RES"
print_result "Title mentions the session" "New session scheduled" "$LIST_RES"
NOTIF_ID=$(json_get "$LIST_RES" id)

# ---------------------------------------------------------------------------
# Test 3: Unread count is at least 1
# ---------------------------------------------------------------------------
echo ""
echo "[ 3 ] Member unread-count"
COUNT_RES=$(curl -s -X GET "$BASE_URL/notifications/$MEMBER_ID/unread-count" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "Returns unread_count" "unread_count" "$COUNT_RES"
print_result "Count is 1" "\"unread_count\":1" "$COUNT_RES"

# ---------------------------------------------------------------------------
# Test 4: Mark one as read
# ---------------------------------------------------------------------------
echo ""
echo "[ 4 ] Mark one notification as read"
READ_RES=$(curl -s -X PATCH "$BASE_URL/notifications/$NOTIF_ID/read" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "is_read is true" "\"is_read\":true" "$READ_RES"

COUNT2_RES=$(curl -s -X GET "$BASE_URL/notifications/$MEMBER_ID/unread-count" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "Count back to 0" "\"unread_count\":0" "$COUNT2_RES"

# ---------------------------------------------------------------------------
# Test 5: Mark all as read
# ---------------------------------------------------------------------------
echo ""
echo "[ 5 ] Mark all as read"
ALL_RES=$(curl -s -X PATCH "$BASE_URL/notifications/$MEMBER_ID/read-all" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "Returns updated count" "updated" "$ALL_RES"

# ---------------------------------------------------------------------------
# Test 6: A user cannot read another user's notifications
# ---------------------------------------------------------------------------
echo ""
echo "[ 6 ] Member cannot read the leader's notifications (403)"
FORBIDDEN_RES=$(curl -s -X GET "$BASE_URL/notifications/$LEADER_ID" \
  -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "Access denied" "Not allowed" "$FORBIDDEN_RES"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
