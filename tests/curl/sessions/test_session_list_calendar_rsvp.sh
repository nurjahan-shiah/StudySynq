#!/bin/bash
# ===========================================================================
# StudySynq - Session List, Calendar & RSVP Tests
# Covers:
# - US-C.2 Calendar View (Month/Week)
# - US-C.3 Session List & Timeline View
# - US-C.5 Session Detail & RSVP Page
# @author: Fahad Sohail
#
# Both the calendar (US-C.2) and the list/timeline view (US-C.3) render
# from the same GET /groups/:id/sessions feed, so this suite checks that
# feed's shape (ordering, multi-month spread) plus the session detail +
# RSVP endpoints backing US-C.5.
#
# Run:
#   bash tests/curl/sessions/test_session_list_calendar_rsvp.sh
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

index_of() {
  # index_of "$haystack" "$needle" -> character offset, or -1 if absent
  local haystack="$1" needle="$2"
  local prefix="${haystack%%"$needle"*}"
  if [ "$prefix" = "$haystack" ]; then
    echo -1
  else
    echo "${#prefix}"
  fi
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
echo "  SESSION LIST / CALENDAR / RSVP TESTS"
echo "  US-C.2 | US-C.3 | US-C.5"
echo "========================================"

LEADER_EMAIL="sess_leader_${TS}@yorku.ca"
MEMBER_EMAIL="sess_member_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
LEADER=$(reg "{\"name\":\"Session Leader\",\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

MEMBER=$(reg "{\"name\":\"Session Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)

print_result "Leader registered" "access_token" "$LEADER"
print_result "Member registered" "access_token" "$MEMBER"

if [ -z "$LT" ] || [ -z "$MT" ]; then
  echo "Setup failed because a token was missing."
  exit 1
fi

echo ""
echo "[ setup ] Create group and join member"
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Session Calendar Test ${TS}\",\"is_public\":true}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "[ setup ] Schedule three sessions spread across different months"
SESSION_A=$(curl -s -X POST "$BASE_URL/groups/$GID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d '{"title":"December Kickoff","scheduled_at":"2026-12-05T10:00:00Z","location":"Library"}')
SID_A=$(json_get "$SESSION_A" id)

SESSION_B=$(curl -s -X POST "$BASE_URL/groups/$GID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d '{"title":"January Review","scheduled_at":"2027-01-10T14:00:00Z","location":"Room 204"}')
SID_B=$(json_get "$SESSION_B" id)

SESSION_C=$(curl -s -X POST "$BASE_URL/groups/$GID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d '{"title":"December Wrap-up","scheduled_at":"2026-12-20T09:00:00Z","location":"Online"}')
SID_C=$(json_get "$SESSION_C" id)

print_result "Session A created" "December Kickoff" "$SESSION_A"
print_result "Session B created" "January Review" "$SESSION_B"
print_result "Session C created" "December Wrap-up" "$SESSION_C"

echo ""
echo "-----------------------------"
echo " US-C.2 / US-C.3: List feed backing calendar + timeline views"
echo "-----------------------------"

echo ""
echo "[ C2C3-1 ] Group session feed includes sessions from multiple months"
LIST=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/sessions" \
  -H "Authorization: Bearer $LT")
check_status "List sessions succeeds" "$(status_code "$LIST")" "200"
LIST_BODY=$(body_only "$LIST")
print_result "Feed includes December session" "December Kickoff" "$LIST_BODY"
print_result "Feed includes January session" "January Review" "$LIST_BODY"
print_result "Feed includes each session's scheduled_at (for calendar placement)" "scheduled_at" "$LIST_BODY"

echo ""
echo "[ C2C3-2 ] Feed is ordered chronologically (earliest first) so list/timeline grouping is stable"
IDX_A=$(index_of "$LIST_BODY" "December Kickoff")
IDX_C=$(index_of "$LIST_BODY" "December Wrap-up")
IDX_B=$(index_of "$LIST_BODY" "January Review")
if [ "$IDX_A" -ge 0 ] && [ "$IDX_C" -ge 0 ] && [ "$IDX_B" -ge 0 ] && [ "$IDX_A" -lt "$IDX_C" ] && [ "$IDX_C" -lt "$IDX_B" ]; then
  echo "  PASS - Sessions ordered earliest-to-latest (Dec 5 < Dec 20 < Jan 10)"; PASS=$((PASS+1))
else
  echo "  FAIL - Sessions ordered earliest-to-latest (Dec 5 < Dec 20 < Jan 10)"
  echo "     Got offsets: A(Dec5)=$IDX_A C(Dec20)=$IDX_C B(Jan10)=$IDX_B"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ C2C3-3 ] Member (not just leader) can load the feed to view calendar/list"
MEMBER_LIST=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/sessions" \
  -H "Authorization: Bearer $MT")
check_status "Member can list group sessions" "$(status_code "$MEMBER_LIST")" "200"

echo ""
echo "-----------------------------"
echo " US-C.5: Session detail + RSVP"
echo "-----------------------------"

echo ""
echo "[ C5-1 ] Member RSVPs attending to a session"
RSVP1=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/sessions/$SID_A/rsvp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" \
  -d '{"status":"attending"}')
check_status "RSVP attending succeeds" "$(status_code "$RSVP1")" "200" "201"
print_result "RSVP response has attending status" "\"status\":\"attending\"" "$(body_only "$RSVP1")"

echo ""
echo "[ C5-2 ] Session detail shows the attendee in the attendee list"
DETAIL1=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/sessions/$SID_A" \
  -H "Authorization: Bearer $LT")
check_status "Session detail loads" "$(status_code "$DETAIL1")" "200"
DETAIL1_BODY=$(body_only "$DETAIL1")
print_result "Detail includes attendees array" "attendees" "$DETAIL1_BODY"
print_result "Attendee list shows member's name" "Session Member" "$DETAIL1_BODY"
print_result "Attendee list shows attending status" "attending" "$DETAIL1_BODY"

echo ""
echo "[ C5-3 ] RSVP is an upsert — member changes their mind to not attending"
RSVP2=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/sessions/$SID_A/rsvp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" \
  -d '{"status":"not_attending"}')
check_status "RSVP update succeeds" "$(status_code "$RSVP2")" "200" "201"

DETAIL2=$(curl -s -X GET "$BASE_URL/sessions/$SID_A" -H "Authorization: Bearer $LT")
print_result "Updated RSVP reflected in detail" "not_attending" "$DETAIL2"
UPDATED_COUNT=$(echo "$DETAIL2" | grep -o '"user_id"' | wc -l | tr -d ' ')
if [ "$UPDATED_COUNT" = "1" ]; then
  echo "  PASS - RSVP upsert did not create a duplicate attendee row"; PASS=$((PASS+1))
else
  echo "  FAIL - RSVP upsert did not create a duplicate attendee row"
  echo "     Expected 1 attendee entry, got: $UPDATED_COUNT"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ C5-4 ] Leader can also RSVP to their own session, growing the attendee list"
RSVP_LEADER=$(curl -s -X POST "$BASE_URL/sessions/$SID_A/rsvp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d '{"status":"attending"}')
print_result "Leader RSVP accepted" "attending" "$RSVP_LEADER"

DETAIL3=$(curl -s -X GET "$BASE_URL/sessions/$SID_A" -H "Authorization: Bearer $LT")
ATTENDEE_COUNT=$(echo "$DETAIL3" | grep -o '"user_id"' | wc -l | tr -d ' ')
if [ "$ATTENDEE_COUNT" = "2" ]; then
  echo "  PASS - Attendee list now has both leader and member"; PASS=$((PASS+1))
else
  echo "  FAIL - Attendee list now has both leader and member"
  echo "     Expected 2 attendees, got: $ATTENDEE_COUNT"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ C5-5 ] Cannot RSVP to a cancelled session"
curl -s -X PATCH "$BASE_URL/sessions/$SID_C/cancel" -H "Authorization: Bearer $LT" > /dev/null
CANCELLED_RSVP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/sessions/$SID_C/rsvp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" \
  -d '{"status":"attending"}')
check_status "RSVP to cancelled session rejected" "$(status_code "$CANCELLED_RSVP")" "400"
print_result "Rejection mentions cancelled" "cancelled" "$(body_only "$CANCELLED_RSVP")"

echo ""
echo "[ C5-6 ] RSVP to a non-existent session returns 404"
MISSING_RSVP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/sessions/00000000-0000-0000-0000-000000000000/rsvp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" \
  -d '{"status":"attending"}')
check_status "RSVP to missing session returns 404" "$(status_code "$MISSING_RSVP")" "404"

echo ""
echo "[ C5-7 ] Session detail for a non-existent session returns 404"
MISSING_DETAIL=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/sessions/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $LT")
check_status "Missing session detail returns 404" "$(status_code "$MISSING_DETAIL")" "404"

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
