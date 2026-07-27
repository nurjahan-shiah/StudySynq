#!/bin/bash
# ===========================================================================
# StudySync - Notification Preferences Tests (US-E.5)
# Verifies defaults, persistence, that preferences are enforced at creation
# time (a disabled category produces NO notification, but the underlying task/
# announcement still happens), and per-user permissions.
# Run: bash tests/curl/preferences/test_preferences.sh
# ===========================================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0
TS=$(date +%s)

print_result() {
  local label=$1 expected=$2 actual=$3
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ PASS — $label"; PASS=$((PASS+1))
  else
    echo "  ❌ FAIL — $label"
    echo "     Expected to contain: $expected"
    echo "     Got: $actual"
    FAIL=$((FAIL+1))
  fi
}
# absent = assertion that a substring is NOT present
absent_result() {
  local label=$1 needle=$2 actual=$3
  if echo "$actual" | grep -q "$needle"; then
    echo "  ❌ FAIL — $label"; echo "     Did NOT expect: $needle"; echo "     Got: $actual"; FAIL=$((FAIL+1))
  else
    echo "  ✅ PASS — $label"; PASS=$((PASS+1))
  fi
}
json_get() { echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"; }

echo ""
echo "=============================="
echo "  NOTIFICATION PREFERENCES TESTS"
echo "=============================="

# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Register leader + member M + member M2, create group, both join"
L=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Pref Leader\",\"email\":\"pref_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LT=$(json_get "$L" access_token); LID=$(json_get "$L" user_id)
M=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Member M\",\"email\":\"pref_m_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
MT=$(json_get "$M" access_token); MID=$(json_get "$M" user_id)
M2=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Member Two\",\"email\":\"pref_m2_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
M2T=$(json_get "$M2" access_token); M2ID=$(json_get "$M2" user_id)
G=$(curl -s -X POST "$BASE_URL/groups" -H "Content-Type: application/json" -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Pref Group ${TS}\",\"is_public\":true}")
GID=$(json_get "$G" id)
curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null
curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $M2T" > /dev/null
print_result "Group created" "id" "$G"

# ---------------------------------------------------------------------------
echo ""
echo "[ 1 ] Default preferences (sessions/announcements/tasks/resources ON, group_activity OFF)"
DEF=$(curl -s -X GET "$BASE_URL/notification-preferences/$MID" -H "Authorization: Bearer $MT")
print_result "tasks default ON" "\"tasks\":true" "$DEF"
print_result "announcements default ON" "\"announcements\":true" "$DEF"
print_result "group_activity default OFF" "\"group_activity\":false" "$DEF"

# ---------------------------------------------------------------------------
echo ""
echo "[ 2 ] Member M turns OFF tasks + announcements; change persists"
UPD=$(curl -s -X PATCH "$BASE_URL/notification-preferences/$MID" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" -d '{"tasks":false,"announcements":false}')
print_result "tasks now OFF" "\"tasks\":false" "$UPD"
print_result "announcements now OFF" "\"announcements\":false" "$UPD"
REGET=$(curl -s -X GET "$BASE_URL/notification-preferences/$MID" -H "Authorization: Bearer $MT")
print_result "persists on re-fetch" "\"tasks\":false" "$REGET"

# ---------------------------------------------------------------------------
echo ""
echo "[ 3 ] Leader assigns M a task — task is created but NO task notification"
TASK=$(curl -s -X POST "$BASE_URL/groups/$GID/tasks" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" -d "{\"title\":\"Silent task\",\"priority\":\"medium\",\"assigned_to\":\"$MID\"}")
print_result "Task still created" "Silent task" "$TASK"
MTASKS=$(curl -s -X GET "$BASE_URL/tasks/user/$MID" -H "Authorization: Bearer $MT")
print_result "Task appears in M's task list" "Silent task" "$MTASKS"
MNOTIFS=$(curl -s -X GET "$BASE_URL/notifications/$MID" -H "Authorization: Bearer $MT")
absent_result "No task notification for M" '"type":"task"' "$MNOTIFS"

# ---------------------------------------------------------------------------
echo ""
echo "[ 4 ] Leader posts an announcement — M (OFF) skipped, M2 (ON) notified"
curl -s -X POST "$BASE_URL/groups/$GID/announcements" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" -d '{"title":"Exam Friday","message":"Review session Friday.","is_pinned":false}' > /dev/null
MNOTIFS2=$(curl -s -X GET "$BASE_URL/notifications/$MID" -H "Authorization: Bearer $MT")
absent_result "No announcement notification for M" '"type":"announcement"' "$MNOTIFS2"
M2COUNT=$(curl -s -X GET "$BASE_URL/notifications/$M2ID/unread-count" -H "Authorization: Bearer $M2T")
print_result "M2 still receives the announcement" "\"unread_count\":1" "$M2COUNT"

# ---------------------------------------------------------------------------
echo ""
echo "[ 5 ] A user cannot read or edit someone else's preferences (403)"
FORBID_GET=$(curl -s -X GET "$BASE_URL/notification-preferences/$LID" -H "Authorization: Bearer $MT")
print_result "GET others' prefs denied" "Not allowed to view" "$FORBID_GET"
FORBID_PATCH=$(curl -s -X PATCH "$BASE_URL/notification-preferences/$LID" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" -d '{"tasks":false}')
print_result "PATCH others' prefs denied" "only update your own" "$FORBID_PATCH"

# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
