#!/bin/bash
# ===========================================================================
# StudySync - Moderation Console & Audit Log Tests (US-F.2)
# Verifies admins can soft-delete groups/resources/announcements platform-wide,
# that moderated content becomes inaccessible to users, that every deletion is
# audit-logged, and that non-admins are blocked (403).
# Run: bash tests/curl/moderation/test_moderation.sh
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
    echo "  ❌ FAIL — $label"; echo "     Expected to contain: $expected"; echo "     Got: $actual"; FAIL=$((FAIL+1))
  fi
}
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
echo "  MODERATION CONSOLE TESTS"
echo "=============================="

# ---------------------------------------------------------------------------
echo ""
echo "[ setup ] Register admin + leader + member; leader creates group, member joins"
ADMIN=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Mod Admin\",\"email\":\"mod_admin_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"admin\"}")
AT=$(json_get "$ADMIN" access_token)
LEADER=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Mod Leader\",\"email\":\"mod_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)
MEMBER=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Mod Member\",\"email\":\"mod_member_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)

GROUP=$(curl -s -X POST "$BASE_URL/groups" -H "Content-Type: application/json" -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Mod Group ${TS}\",\"is_public\":true}")
GID=$(json_get "$GROUP" id)
curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

RES=$(curl -s -X POST "$BASE_URL/groups/$GID/resources?file_name=exam-solutions.pdf&file_url=http://example.com/x.pdf&file_type=pdf" \
  -H "Authorization: Bearer $LT")
RID=$(json_get "$RES" id)
ANN=$(curl -s -X POST "$BASE_URL/groups/$GID/announcements" -H "Content-Type: application/json" -H "Authorization: Bearer $LT" \
  -d '{"title":"Spammy announcement","message":"buy now","is_pinned":false}')
AID=$(json_get "$ANN" id)
print_result "Group created" "id" "$GROUP"
print_result "Resource created" "exam-solutions.pdf" "$RES"
print_result "Announcement created" "Spammy announcement" "$ANN"

# ---------------------------------------------------------------------------
echo ""
echo "[ 1 ] Admin can list moderatable content"
MG=$(curl -s -X GET "$BASE_URL/admin/moderation/groups" -H "Authorization: Bearer $AT")
print_result "Groups list shows the group" "Mod Group ${TS}" "$MG"
MR=$(curl -s -X GET "$BASE_URL/admin/moderation/resources" -H "Authorization: Bearer $AT")
print_result "Resources list shows the file" "exam-solutions.pdf" "$MR"
MA=$(curl -s -X GET "$BASE_URL/admin/moderation/announcements" -H "Authorization: Bearer $AT")
print_result "Announcements list shows the post" "Spammy announcement" "$MA"

# ---------------------------------------------------------------------------
echo ""
echo "[ 2 ] Non-admins are blocked (403)"
FORBID_GET=$(curl -s -X GET "$BASE_URL/admin/moderation/groups" -H "Authorization: Bearer $MT")
print_result "Student GET denied" "Access denied" "$FORBID_GET"
FORBID_DEL=$(curl -s -X DELETE "$BASE_URL/admin/moderation/group/$GID" -H "Authorization: Bearer $LT")
print_result "Leader DELETE denied" "Access denied" "$FORBID_DEL"

# ---------------------------------------------------------------------------
echo ""
echo "[ 3 ] Admin deletes the resource; it becomes inaccessible; audit entry created"
DELRES=$(curl -s -X DELETE "$BASE_URL/admin/moderation/resource/$RID?reason=Unauthorized%20material" -H "Authorization: Bearer $AT")
print_result "Delete returns a log_id" "log_id" "$DELRES"
LIST_AFTER=$(curl -s -X GET "$BASE_URL/groups/$GID/resources" -H "Authorization: Bearer $MT")
absent_result "Resource gone from group list" "exam-solutions.pdf" "$LIST_AFTER"
GET_AFTER=$(curl -s -o /dev/null -w '%{http_code}' -X GET "$BASE_URL/resources/$RID" -H "Authorization: Bearer $MT")
print_result "Direct fetch now 404" "404" "$GET_AFTER"
AUDIT=$(curl -s -X GET "$BASE_URL/admin/moderation/audit-logs" -H "Authorization: Bearer $AT")
print_result "Audit shows resource entry" "\"entity_type\":\"resource\"" "$AUDIT"
print_result "Audit shows the reason" "Unauthorized material" "$AUDIT"
print_result "Audit shows the admin" "Mod Admin" "$AUDIT"

# ---------------------------------------------------------------------------
echo ""
echo "[ 3b ] Admin reverts the resource deletion; it becomes visible again"
RESTORE=$(curl -s -X POST "$BASE_URL/admin/moderation/resource/$RID/restore" -H "Authorization: Bearer $AT")
print_result "Restore returns a log_id" "log_id" "$RESTORE"
LIST_RESTORED=$(curl -s -X GET "$BASE_URL/groups/$GID/resources" -H "Authorization: Bearer $MT")
print_result "Resource back in group list" "exam-solutions.pdf" "$LIST_RESTORED"
GET_RESTORED=$(curl -s -o /dev/null -w '%{http_code}' -X GET "$BASE_URL/resources/$RID" -H "Authorization: Bearer $MT")
print_result "Direct fetch works again (200)" "200" "$GET_RESTORED"
AUDIT_R=$(curl -s -X GET "$BASE_URL/admin/moderation/audit-logs" -H "Authorization: Bearer $AT")
print_result "Audit shows a restore action" "\"action\":\"restore\"" "$AUDIT_R"

# ---------------------------------------------------------------------------
echo ""
echo "[ 4 ] Admin deletes the announcement; gone from the board"
curl -s -X DELETE "$BASE_URL/admin/moderation/announcement/$AID?reason=Spam" -H "Authorization: Bearer $AT" > /dev/null
BOARD=$(curl -s -X GET "$BASE_URL/groups/$GID/announcements" -H "Authorization: Bearer $MT")
absent_result "Announcement gone from board" "Spammy announcement" "$BOARD"

# ---------------------------------------------------------------------------
echo ""
echo "[ 5 ] Admin deletes the group; gone from listings and detail 404"
curl -s -X DELETE "$BASE_URL/admin/moderation/group/$GID?reason=Policy%20violation" -H "Authorization: Bearer $AT" > /dev/null
GLIST=$(curl -s -X GET "$BASE_URL/groups" -H "Authorization: Bearer $MT")
absent_result "Group gone from public list" "Mod Group ${TS}" "$GLIST"
GDETAIL=$(curl -s -o /dev/null -w '%{http_code}' -X GET "$BASE_URL/groups/$GID" -H "Authorization: Bearer $MT")
print_result "Group detail now 404" "404" "$GDETAIL"

# ---------------------------------------------------------------------------
echo ""
echo "[ 6 ] Audit log now has all three moderation actions"
AUDIT2=$(curl -s -X GET "$BASE_URL/admin/moderation/audit-logs" -H "Authorization: Bearer $AT")
print_result "Has group action" "\"entity_type\":\"group\"" "$AUDIT2"
print_result "Has announcement action" "\"entity_type\":\"announcement\"" "$AUDIT2"

echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
