#!/bin/bash
# ===========================================
# StudySync - Dashboard Tests
# Tests: JWT token validation via /auth/validate
# Run: bash tests/dashboard/test_dashboard.sh
# ===========================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0

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

echo ""
echo "=============================="
echo "  DASHBOARD TESTS"
echo "=============================="

# ------------------------------------------
# Setup: register or login to get token
# ------------------------------------------
TEST_EMAIL="dashboard_test@yorku.ca"
echo ""
echo "[ setup ] Registering $TEST_EMAIL..."

SETUP=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dashboard User",
    "email": "'"$TEST_EMAIL"'",
    "password": "Password1",
    "role": "student"
  }')

TOKEN=$(echo "$SETUP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# If registration failed (email already exists), fall back to login
if [ -z "$TOKEN" ]; then
  if echo "$SETUP" | grep -q "already registered"; then
    echo "  Already registered — logging in instead..."
    LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
      -H "Content-Type: application/json" \
      -d '{
        "email": "'"$TEST_EMAIL"'",
        "password": "Password1"
      }')
    TOKEN=$(echo "$LOGIN" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  fi
fi

if [ -z "$TOKEN" ]; then
  echo "  ⚠️  Setup failed — could not get token. Is the server running?"
  echo "  Got: $SETUP"
  exit 1
fi
echo "  Token acquired ✓"

# ------------------------------------------
# Test 1: Valid token passes validation
# ------------------------------------------
echo ""
echo "[ 1 ] Valid token — should be accepted"
RES=$(curl -s "$BASE_URL/auth/validate" \
  -H "Authorization: Bearer $TOKEN")
print_result "Token is valid" "user_id\|email\|role\|valid" "$RES"

# ------------------------------------------
# Test 2: No token — should be rejected
# ------------------------------------------
echo ""
echo "[ 2 ] No token — should be rejected"
RES=$(curl -s "$BASE_URL/auth/validate")
print_result "Rejected with 401/error" "Invalid\|detail\|401\|unauthorized" "$RES"

# ------------------------------------------
# Test 3: Malformed token — should be rejected
# ------------------------------------------
echo ""
echo "[ 3 ] Malformed token — should be rejected"
RES=$(curl -s "$BASE_URL/auth/validate" \
  -H "Authorization: Bearer thisisnotavalidtoken")
print_result "Rejected with error" "detail\|Invalid\|error" "$RES"

# ------------------------------------------
# Test 4: Frontend page loads (HTTP 200)
# ------------------------------------------
echo ""
echo "[ 4 ] Dashboard page returns HTTP 200"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard)
print_result "Page returns 200" "200" "$STATUS"

# ------------------------------------------
# Test 5: Signup page returns HTTP 200
# ------------------------------------------
echo ""
echo "[ 5 ] Signup page returns HTTP 200"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/signup)
print_result "Page returns 200" "200" "$STATUS"

# ------------------------------------------
# Summary
# ------------------------------------------
echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""