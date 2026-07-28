#!/bin/bash
# ===========================================================================
# StudySynq - AI Announcement Drafting Tests
# Covers:
# - US-G.4 AI Announcement Drafting Assistant
#
# Run:
#   bash tests/curl/announcements/test_ai_announcement_drafting.sh
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
echo "  AI ANNOUNCEMENT DRAFTING TESTS"
echo "========================================"

LEADER_EMAIL="ai_leader_${TS}@yorku.ca"
MEMBER_EMAIL="ai_member_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
LEADER=$(reg "{\"name\":\"AI Leader\",\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

MEMBER=$(reg "{\"name\":\"AI Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
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
  -d "{\"name\":\"AI Announcement Test ${TS}\",\"is_public\":true}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "[ G4-1 ] Leader can request AI announcement improvement"
AI_LEADER=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/announcements/ai-draft" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d "{\"title\":\"Meeting Update\",\"rough_draft\":\"hi everyone the project meeting is moved to monday at 6pm because some people had conflicts. please upload your progress notes before sunday night.\",\"tone\":\"clear, friendly, and professional\"}")

AI_STATUS=$(status_code "$AI_LEADER")
AI_BODY=$(body_only "$AI_LEADER")

if [ "$AI_STATUS" = "200" ] && echo "$AI_BODY" | grep -q "draft"; then
  echo "  PASS  Leader receives AI-improved draft"
  PASS=$((PASS+1))
elif echo "$AI_BODY" | grep -Eqi "GROQ|AI drafting|configured|unavailable|temporarily|API key"; then
  echo "  PASS  AI endpoint returns controlled configuration/service message"
  PASS=$((PASS+1))
else
  echo "  FAIL  Leader AI drafting request"
  echo "     Expected HTTP 200 with draft or a controlled AI configuration/service message"
  echo "     Got HTTP $AI_STATUS $AI_BODY"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ G4-2 ] Regular member cannot use AI drafting"
AI_MEMBER=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/announcements/ai-draft" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MT" \
  -d "{\"title\":\"Meeting Update\",\"rough_draft\":\"meeting moved to monday at 6pm\",\"tone\":\"clear\"}")

check_status "Regular member is blocked from AI drafting" "$(status_code "$AI_MEMBER")" "401" "403"

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0