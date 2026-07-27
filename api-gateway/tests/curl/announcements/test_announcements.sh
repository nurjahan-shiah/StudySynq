#!/bin/bash
# ===========================================================================
# StudySync - Announcement Board Tests (US-E.2)
# Flow: register leader + member -> create group -> member joins ->
#   leader posts a normal + a pinned announcement -> feed is pinned-first ->
#   member receives an "announcement" notification deep-linking to the board ->
#   member cannot post (403) -> leader can edit / pin / delete.
# Run: bash tests/curl/announcements/test_announcements.sh
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

# Extract first occurrence of a top-level string field
json_get() {
  echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"
}
# Extract the Nth "id":"..." value
json_id_n() {
  echo "$1" | grep -o '"id":[ ]*"[^"]*"' | sed -n "${2}p" | sed 's/.*:[ ]*"//;s/"//'
}

echo ""
echo "=============================="
echo "  ANNOUNCEMENT BOARD TESTS"
echo "=============================="

# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Register leader + member, create group, member joins"
LEADER=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Ann Leader\",\"email\":\"ann_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LEADER_TOKEN=$(json_get "$LEADER" access_token)

MEMBER=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Ann Member\",\"email\":\"ann_member_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
MEMBER_TOKEN=$(json_get "$MEMBER" access_token)
MEMBER_ID=$(json_get "$MEMBER" user_id)

GROUP=$(curl -s -X POST "$BASE_URL/groups" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d "{\"name\":\"Ann Group ${TS}\",\"description\":\"E.2 test\",\"is_public\":true}")
GROUP_ID=$(json_get "$GROUP" id)
curl -s -X POST "$BASE_URL/groups/$GROUP_ID/join" -H "Authorization: Bearer $MEMBER_TOKEN" > /dev/null
print_result "Group created" "id" "$GROUP"

# ---------------------------------------------------------------------------
echo ""
echo "[ 1 ] Leader posts a normal then a pinned announcement"
A1=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/announcements" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d '{"title":"Weekly update","message":"Meeting notes are posted.","is_pinned":false}')
print_result "Normal announcement created" "Weekly update" "$A1"
print_result "Author name resolved" "Ann Leader" "$A1"

A2=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/announcements" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d '{"title":"Final exam review Friday 6 PM","message":"Bring practice questions.","is_pinned":true}')
print_result "Pinned announcement created" "\"is_pinned\":true" "$A2"

# ---------------------------------------------------------------------------
echo ""
echo "[ 2 ] Feed lists pinned first"
FEED=$(curl -s -X GET "$BASE_URL/groups/$GROUP_ID/announcements" -H "Authorization: Bearer $MEMBER_TOKEN")
FIRST_TITLE=$(json_get "$FEED" title)
print_result "Pinned announcement is first" "Final exam review Friday 6 PM" "$FIRST_TITLE"
print_result "Both announcements present" "Weekly update" "$FEED"

# ---------------------------------------------------------------------------
echo ""
echo "[ 3 ] Member received an announcement notification (deep-link to board)"
NOTIFS=$(curl -s -X GET "$BASE_URL/notifications/$MEMBER_ID" -H "Authorization: Bearer $MEMBER_TOKEN")
print_result "Has announcement notification" "\"type\":\"announcement\"" "$NOTIFS"
print_result "Links to the group board" "tab=announcements" "$NOTIFS"
print_result "Two announcement notifications" "Final exam review Friday 6 PM" "$NOTIFS"

# ---------------------------------------------------------------------------
echo ""
echo "[ 4 ] Member cannot post an announcement (403)"
FORBIDDEN=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/announcements" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -d '{"title":"Sneaky","message":"Should be blocked","is_pinned":false}')
print_result "Members blocked from posting" "Only group leaders" "$FORBIDDEN"

# ---------------------------------------------------------------------------
echo ""
echo "[ 5 ] Leader edits + unpins an announcement"
A2_ID=$(echo "$A2" | sed -n 's/.*"id":[ ]*"\([^"]*\)".*/\1/p')
EDIT=$(curl -s -X PATCH "$BASE_URL/announcements/$A2_ID" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d '{"title":"Final exam review — Friday 6 PM (room TBA)","is_pinned":false}')
print_result "Title updated" "room TBA" "$EDIT"
print_result "Unpinned" "\"is_pinned\":false" "$EDIT"

# ---------------------------------------------------------------------------
echo ""
echo "[ 6 ] Leader deletes an announcement"
DEL_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/announcements/$A2_ID" \
  -H "Authorization: Bearer $LEADER_TOKEN")
print_result "Delete returns 204" "204" "$DEL_CODE"
FEED2=$(curl -s -X GET "$BASE_URL/groups/$GROUP_ID/announcements" -H "Authorization: Bearer $MEMBER_TOKEN")
if echo "$FEED2" | grep -q "room TBA"; then
  echo "  ❌ FAIL — Deleted announcement still present"; FAIL=$((FAIL+1))
else
  echo "  ✅ PASS — Deleted announcement gone from feed"; PASS=$((PASS+1))
fi

# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
