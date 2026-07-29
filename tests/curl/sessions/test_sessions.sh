#!/bin/bash
# ============================================================
# Test Suite: US-C.1, US-C.4, US-G.2 — Sessions Service
# @author: Uzma Alam
# ============================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0

# ── Colours ──────────────────────────────────────────────────
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
    echo "       Expected to find: $expected"
    echo "       Got: $actual"
    ((FAIL++))
  fi
}

# ── Setup: register + login ───────────────────────────────────
echo ""
echo "=============================="
echo " Sessions Service Tests"
echo " US-C.1 | US-C.4 | US-G.2"
echo "=============================="
echo ""

echo "[ SETUP ] Registering test leader..."
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Leader","email":"uzma_test_leader@test.com","password":"Test1234!","role":"student"}' > /dev/null

echo "[ SETUP ] Logging in..."
LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uzma_test_leader@test.com","password":"Test1234!"}')
TOKEN=$(echo "$LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
USER_ID=$(echo "$LOGIN" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not get token. Exiting."
  exit 1
fi
echo "[ SETUP ] Token obtained for user $USER_ID"
echo ""

echo "[ SETUP ] Creating a group..."
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Uzma Test Group","description":"Test group","is_public":true,"course_ids":[]}')
GROUP_ID=$(echo "$GROUP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "[ SETUP ] Group ID: $GROUP_ID"
echo ""

# ============================================================
# US-C.1 — Session Scheduling
# ============================================================
echo "-----------------------------"
echo " US-C.1: Session Scheduling"
echo "-----------------------------"

# Test 1: Create session successfully
FUTURE_DATE="2026-12-01T14:00:00Z"
SESSION=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"title\": \"Midterm Review\",
    \"scheduled_at\": \"$FUTURE_DATE\",
    \"duration_minutes\": 90,
    \"location\": \"Scott Library Room 204\",
    \"description\": \"Covering chapters 5 to 8\"
  }")
SESSION_ID=$(echo "$SESSION" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
print_result "Create session with all fields" "Midterm Review" "$SESSION"
print_result "Session has location" "Scott Library" "$SESSION"
print_result "Session has description" "chapters 5 to 8" "$SESSION"
print_result "Session is_cancelled is false" "false" "$SESSION"

# Test 2: List sessions for group
LIST=$(curl -s -X GET "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Authorization: Bearer $TOKEN")
print_result "List sessions returns session" "Midterm Review" "$LIST"

# Test 3: Reject past date
PAST=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Past Session","scheduled_at":"2020-01-01T10:00:00Z","duration_minutes":60}')
print_result "Reject past scheduled_at (400)" "future date" "$PAST"

# Test 4: Reject duplicate time (conflict)
CONFLICT=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"title\":\"Duplicate\",\"scheduled_at\":\"$FUTURE_DATE\",\"duration_minutes\":60}")
print_result "Reject scheduling conflict (409)" "already scheduled" "$CONFLICT"

# Test 5: Non-member cannot create session
echo "[ SETUP ] Registering non-member..."
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Non Member","email":"uzma_nonmember@test.com","password":"Test1234!","role":"student"}' > /dev/null
OTHER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uzma_nonmember@test.com","password":"Test1234!"}')
OTHER_TOKEN=$(echo "$OTHER_LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
FORBIDDEN=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -d '{"title":"Hack","scheduled_at":"2026-12-02T10:00:00Z","duration_minutes":60}')
print_result "Non-leader blocked (403)" "403\|leader\|forbidden\|Forbidden" "$FORBIDDEN"

echo ""

# ============================================================
# US-C.4 — Edit and Cancel Session
# ============================================================
echo "-----------------------------"
echo " US-C.4: Edit & Cancel"
echo "-----------------------------"

# Test 6: Edit session
EDIT=$(curl -s -X PUT "$BASE_URL/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Final Exam Review","location":"Online - Zoom"}')
print_result "Edit session title" "Final Exam Review" "$EDIT"
print_result "Edit session location" "Online - Zoom" "$EDIT"

# Test 7: Cancel session
CANCEL=$(curl -s -X PATCH "$BASE_URL/sessions/$SESSION_ID/cancel" \
  -H "Authorization: Bearer $TOKEN")
print_result "Cancel session sets is_cancelled true" "true" "$CANCEL"

# Test 8: Cannot edit cancelled session
EDIT_CANCELLED=$(curl -s -X PUT "$BASE_URL/sessions/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Try Edit Cancelled"}')
print_result "Cannot edit cancelled session (400)" "cancelled\|400" "$EDIT_CANCELLED"

# Test 9: Cannot cancel already cancelled session
DOUBLE_CANCEL=$(curl -s -X PATCH "$BASE_URL/sessions/$SESSION_ID/cancel" \
  -H "Authorization: Bearer $TOKEN")
print_result "Cannot cancel already cancelled session" "already cancelled\|400" "$DOUBLE_CANCEL"

echo ""

# ============================================================
# US-G.2 — AI Session Notes Summarizer
# ============================================================
echo "-----------------------------"
echo " US-G.2: AI Notes Summarizer"
echo "-----------------------------"

# Create a new non-cancelled session for summarize test
NEW_SESSION=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/sessions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Summary Test Session","scheduled_at":"2026-12-03T14:00:00Z","duration_minutes":60}')
NEW_SESSION_ID=$(echo "$NEW_SESSION" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

NOTES="We covered binary search trees today. Discussed insertion and deletion. Time complexity is O log n. Action item read chapter 7."
SUMMARY=$(curl -s -X POST "$BASE_URL/sessions/$NEW_SESSION_ID/summarize?notes=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$NOTES'))")" \
  -H "Authorization: Bearer $TOKEN")
print_result "Summarize returns session_id" "$NEW_SESSION_ID" "$SUMMARY"
print_result "Summarize returns summary text" "summary\|Summary\|key\|action" "$SUMMARY"

echo ""

# ============================================================
# Results
# ============================================================
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""