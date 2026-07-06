#!/bin/bash
# ===========================================================================
# StudySync - Task Assigning & Tracking Tests (US-E.3)
# Flow: register leader + member1 + member2 -> group -> both join ->
#   leader assigns a task to member1 -> it appears in member1's list ->
#   member1 gets a 'task' notification linking to /tasks ->
#   member1 completes it (completed_at set) -> member2 cannot edit it (403) ->
#   member1 cannot assign tasks (403) -> leader sees group board -> leader deletes.
# Run: bash tests/curl/tasks/test_tasks.sh
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

json_get() { echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"; }

echo ""
echo "=============================="
echo "  TASK TRACKING TESTS"
echo "=============================="

# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Register leader + 2 members, create group, both join"
LEADER=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Task Leader\",\"email\":\"task_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LEADER_TOKEN=$(json_get "$LEADER" access_token)

M1=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Ahmed Member\",\"email\":\"task_m1_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
M1_TOKEN=$(json_get "$M1" access_token)
M1_ID=$(json_get "$M1" user_id)

M2=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Sara Member\",\"email\":\"task_m2_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
M2_TOKEN=$(json_get "$M2" access_token)

GROUP=$(curl -s -X POST "$BASE_URL/groups" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d "{\"name\":\"Task Group ${TS}\",\"description\":\"E.3 test\",\"is_public\":true}")
GROUP_ID=$(json_get "$GROUP" id)
curl -s -X POST "$BASE_URL/groups/$GROUP_ID/join" -H "Authorization: Bearer $M1_TOKEN" > /dev/null
curl -s -X POST "$BASE_URL/groups/$GROUP_ID/join" -H "Authorization: Bearer $M2_TOKEN" > /dev/null
print_result "Group created" "id" "$GROUP"

# ---------------------------------------------------------------------------
echo ""
echo "[ 1 ] Leader assigns a task to member1 (Ahmed)"
TASK=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/tasks" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d "{\"title\":\"Create Midterm Review Questions\",\"description\":\"Prepare 10 questions for ch 3-4.\",\"priority\":\"high\",\"due_date\":\"2030-07-10\",\"assigned_to\":\"$M1_ID\"}")
TASK_ID=$(json_get "$TASK" id)
print_result "Task created" "Create Midterm Review Questions" "$TASK"
print_result "Assigned to Ahmed" "\"assigned_to_name\":\"Ahmed Member\"" "$TASK"
print_result "Priority high" "\"priority\":\"high\"" "$TASK"
print_result "Starts as todo" "\"status\":\"todo\"" "$TASK"

# ---------------------------------------------------------------------------
echo ""
echo "[ 2 ] Task appears in member1's personal list"
MYTASKS=$(curl -s -X GET "$BASE_URL/tasks/user/$M1_ID" -H "Authorization: Bearer $M1_TOKEN")
print_result "In Ahmed's task list" "Create Midterm Review Questions" "$MYTASKS"
print_result "Shows group name" "Task Group ${TS}" "$MYTASKS"

# ---------------------------------------------------------------------------
echo ""
echo "[ 3 ] Member1 received a task notification linking to /tasks"
NOTIFS=$(curl -s -X GET "$BASE_URL/notifications/$M1_ID" -H "Authorization: Bearer $M1_TOKEN")
print_result "Has task notification" "\"type\":\"task\"" "$NOTIFS"
print_result "Links to /tasks" "\"link\":\"/tasks\"" "$NOTIFS"

# ---------------------------------------------------------------------------
echo ""
echo "[ 4 ] Member1 marks the task completed"
DONE=$(curl -s -X PATCH "$BASE_URL/tasks/$TASK_ID/status" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $M1_TOKEN" -d '{"status":"completed"}')
print_result "Status is completed" "\"status\":\"completed\"" "$DONE"
print_result "completed_at is set" "\"completed_at\":\"2" "$DONE"

# ---------------------------------------------------------------------------
echo ""
echo "[ 5 ] Member2 cannot change member1's task (403)"
FORBIDDEN=$(curl -s -X PATCH "$BASE_URL/tasks/$TASK_ID/status" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $M2_TOKEN" -d '{"status":"todo"}')
print_result "Non-assignee blocked" "Not allowed to update" "$FORBIDDEN"

# ---------------------------------------------------------------------------
echo ""
echo "[ 6 ] Member1 cannot assign tasks (403)"
NOASSIGN=$(curl -s -X POST "$BASE_URL/groups/$GROUP_ID/tasks" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $M1_TOKEN" \
  -d "{\"title\":\"Sneaky\",\"priority\":\"low\",\"assigned_to\":\"$M1_ID\"}")
print_result "Members blocked from assigning" "Only group leaders" "$NOASSIGN"

# ---------------------------------------------------------------------------
echo ""
echo "[ 6b ] Leader edits the task (title + priority)"
EDIT=$(curl -s -X PATCH "$BASE_URL/tasks/$TASK_ID" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEADER_TOKEN" \
  -d '{"title":"Create Midterm Review Questions (v2)","priority":"low"}')
print_result "Title updated" "Create Midterm Review Questions (v2)" "$EDIT"
print_result "Priority lowered" "\"priority\":\"low\"" "$EDIT"

# ---------------------------------------------------------------------------
echo ""
echo "[ 7 ] Leader sees the group task board, then deletes the task"
BOARD=$(curl -s -X GET "$BASE_URL/groups/$GROUP_ID/tasks" -H "Authorization: Bearer $LEADER_TOKEN")
print_result "Board shows the task" "Create Midterm Review Questions" "$BOARD"
DEL_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/tasks/$TASK_ID" \
  -H "Authorization: Bearer $LEADER_TOKEN")
print_result "Delete returns 204" "204" "$DEL_CODE"

# ---------------------------------------------------------------------------
echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
