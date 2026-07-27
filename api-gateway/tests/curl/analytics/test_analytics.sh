#!/bin/bash
# ===========================================================================
# StudySync - Platform Analytics Overview Tests (US-F.6)
# Seeds a course + group + this-week session + resource, then checks the admin
# analytics endpoint reflects them (real aggregated data), and that non-admins
# are blocked (403).
# Run: bash tests/curl/analytics/test_analytics.sh
# ===========================================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0
TS=$(date +%s)
CODE="AN${TS}"

print_result() {
  local label=$1 expected=$2 actual=$3
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ PASS — $label"; PASS=$((PASS+1))
  else
    echo "  ❌ FAIL — $label"; echo "     Expected to contain: $expected"; echo "     Got: $actual"; FAIL=$((FAIL+1))
  fi
}
json_get() { echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"; }
# a future timestamp within the current week (now + 6h)
SCHED=$(python3 -c "import datetime;print((datetime.datetime.utcnow()+datetime.timedelta(hours=6)).strftime('%Y-%m-%dT%H:%M:%S'))")

echo ""
echo "=============================="
echo "  PLATFORM ANALYTICS TESTS"
echo "=============================="

# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Register admin + leader; admin creates a course"
ADMIN=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"An Admin\",\"email\":\"an_admin_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"admin\"}")
AT=$(json_get "$ADMIN" access_token)
LEADER=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"An Leader\",\"email\":\"an_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

COURSE=$(curl -s -X POST "$BASE_URL/admin/courses" -H "Content-Type: application/json" -H "Authorization: Bearer $AT" \
  -d "{\"course_code\":\"${CODE}\",\"course_name\":\"Analytics Test Course\",\"department\":\"EECS\"}")
CID=$(json_get "$COURSE" id)
print_result "Course created" "$CODE" "$COURSE"

# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Leader creates a group linked to the course, a session, and a resource"
GROUP=$(curl -s -X POST "$BASE_URL/groups" -H "Content-Type: application/json" -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Analytics Group ${TS}\",\"is_public\":true,\"course_ids\":[\"${CID}\"]}")
GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"
SESS=$(curl -s -X POST "$BASE_URL/groups/$GID/sessions" -H "Content-Type: application/json" -H "Authorization: Bearer $LT" \
  -d "{\"title\":\"Weekly review\",\"scheduled_at\":\"${SCHED}\",\"location\":\"Library\",\"description\":\"x\"}")
print_result "Session scheduled this week" "Weekly review" "$SESS"
curl -s -X POST "$BASE_URL/groups/$GID/resources?file_name=notes-${TS}.pdf&file_url=http://example.com/n.pdf&file_type=pdf" \
  -H "Authorization: Bearer $LT" > /dev/null

# ---------------------------------------------------------------------------
echo ""
echo "[ 1 ] Admin analytics overview reflects real data"
OVERVIEW=$(curl -s -X GET "$BASE_URL/admin/analytics/overview" -H "Authorization: Bearer $AT")
# totals are cumulative across the DB, so assert the keys exist and the seeded items registered
print_result "Has total_users" "total_users" "$OVERVIEW"
print_result "sessions_this_week >= 1" "\"sessions_this_week\":[1-9]" "$OVERVIEW"
print_result "active_groups >= 1" "\"active_groups\":[1-9]" "$OVERVIEW"
print_result "Most-active courses includes our course" "$CODE" "$OVERVIEW"
print_result "Course shows a session count" "\"session_count\":[1-9]" "$OVERVIEW"
print_result "Recent activity feed present" "recent_activity" "$OVERVIEW"
print_result "Recent activity shows the session" "Weekly review" "$OVERVIEW"

# ---------------------------------------------------------------------------
echo ""
echo "[ 2 ] Non-admins are blocked (403)"
FORBID=$(curl -s -X GET "$BASE_URL/admin/analytics/overview" -H "Authorization: Bearer $LT")
print_result "Leader denied" "Access denied" "$FORBID"

echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
