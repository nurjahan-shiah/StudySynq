#!/bin/bash
# ============================================================
# Test Suite: US-G.3 — AI Resource Q&A (Ask your library)
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
echo " Resource Q&A Tests — US-G.3"
echo "=============================="
echo ""

# ── Setup: register + login a fresh leader ────────────────────
echo "[ SETUP ] Registering test leader..."
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ask Library Leader","email":"uzma_ask_leader@test.com","password":"Test1234!","role":"student"}' > /dev/null

echo "[ SETUP ] Logging in..."
LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uzma_ask_leader@test.com","password":"Test1234!"}')
TOKEN=$(echo "$LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not get token. Exiting."
  exit 1
fi
echo "[ SETUP ] Token obtained."

# ── Setup: create a fresh group owned by this user ────────────
echo "[ SETUP ] Creating a group..."
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Ask Library Test Group","description":"Test group","is_public":true,"course_ids":[]}')
GROUP_ID=$(echo "$GROUP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$GROUP_ID" ]; then
  echo "ERROR: Could not create group. Got: $GROUP"
  exit 1
fi
echo "[ SETUP ] Group ID: $GROUP_ID"
echo ""

echo "-----------------------------"
echo " US-G.3: Ask your library"
echo "-----------------------------"

# Test 1: Ask a question with no resources uploaded yet
ANSWER=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/resources/ask?question=What+did+we+cover+about+normalization" \
  -H "Authorization: Bearer $TOKEN")
print_result "Ask returns answer field" "answer" "$ANSWER"
print_result "Ask returns sources field" "sources" "$ANSWER"

# Test 2: Non-member blocked
echo "[ SETUP ] Registering non-member..."
curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Non Member","email":"uzma_ask_nonmember@test.com","password":"Test1234!","role":"student"}' > /dev/null
OTHER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"uzma_ask_nonmember@test.com","password":"Test1234!"}')
OTHER_TOKEN=$(echo "$OTHER_LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
BLOCKED=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/resources/ask?question=test" \
  -H "Authorization: Bearer $OTHER_TOKEN")
print_result "Non-member blocked (403)" "403\|member\|forbidden" "$BLOCKED"

# Test 3: Empty question handled
EMPTY=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/resources/ask?question=" \
  -H "Authorization: Bearer $TOKEN")
print_result "Empty question returns answer field" "answer\|No resources\|question" "$EMPTY"

echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""