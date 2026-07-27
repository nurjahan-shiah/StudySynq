#!/bin/bash
# ===========================================
# StudySync - Signup Tests
# Tests: POST /auth/register
# Run: bash tests/signup/test_signup.sh
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
echo "  SIGNUP TESTS"
echo "=============================="

# ------------------------------------------
# Test 1: Register as student
# ------------------------------------------
echo ""
echo "[ 1 ] Register new student"
RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "email": "student_test@yorku.ca",
    "password": "Password1",
    "role": "student"
  }')
print_result "Returns access_token" "access_token" "$RES"
print_result "Role is student" "student" "$RES"
print_result "is_first_login true" "true" "$RES"

# ------------------------------------------
# Test 2: Register as group_leader
# ------------------------------------------
echo ""
echo "[ 2 ] Register new group_leader"
RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Leader",
    "email": "leader_test@yorku.ca",
    "password": "Password1",
    "role": "group_leader"
  }')
print_result "Returns access_token" "access_token" "$RES"
print_result "Role is group_leader" "group_leader" "$RES"

# ------------------------------------------
# Test 3: Register as admin
# ------------------------------------------
echo ""
echo "[ 3 ] Register new admin"
RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Admin",
    "email": "admin_test@yorku.ca",
    "password": "Password1",
    "role": "admin"
  }')
print_result "Returns access_token" "access_token" "$RES"
print_result "Role is admin" "admin" "$RES"

# ------------------------------------------
# Test 4: Duplicate email
# ------------------------------------------
echo ""
echo "[ 4 ] Duplicate email (should fail)"
RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "email": "student_test@yorku.ca",
    "password": "Password1",
    "role": "student"
  }')
print_result "Returns already registered error" "already registered" "$RES"

# ------------------------------------------
# Test 5: Missing fields
# ------------------------------------------
echo ""
echo "[ 5 ] Missing email field (should fail)"
RES=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "No Email",
    "password": "Password1",
    "role": "student"
  }')
print_result "Returns validation error" "detail" "$RES"

# ------------------------------------------
# Summary
# ------------------------------------------
echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""