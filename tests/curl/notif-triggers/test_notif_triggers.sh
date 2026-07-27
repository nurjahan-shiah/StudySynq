#!/bin/bash
# ===========================================================================
# StudySync - New Notification Triggers Tests (refinement R1)
# Verifies notifications now fire for: resource upload, group role change,
# and group member removal.
# Run: bash tests/curl/notif-triggers/test_notif_triggers.sh
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
json_get() { echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"; }
# Register with retry — auth-service rate-limits signups (~3/min); wait it out.
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
echo "=============================="
echo "  NOTIFICATION TRIGGER TESTS"
echo "=============================="

echo ""
echo "[ setup ] Register leader + member; create group; member joins"
LEADER=$(reg "{\"name\":\"Trig Leader\",\"email\":\"trig_leader_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)
M1=$(reg "{\"name\":\"Trig Member\",\"email\":\"trig_m1_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
M1T=$(json_get "$M1" access_token); M1ID=$(json_get "$M1" user_id)
GROUP=$(curl -s -X POST "$BASE_URL/groups" -H "Content-Type: application/json" -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Trig Group ${TS}\",\"is_public\":true}")
GID=$(json_get "$GROUP" id)
curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $M1T" > /dev/null
print_result "Group created" "id" "$GROUP"

echo ""
echo "[ 1 ] Uploading a resource notifies group members (type resource)"
curl -s -X POST "$BASE_URL/groups/$GID/resources?file_name=shared-notes-${TS}&file_url=https://example.com/s.pdf&file_type=link" \
  -H "Authorization: Bearer $LT" > /dev/null
M1_NOTIFS=$(curl -s -X GET "$BASE_URL/notifications/$M1ID" -H "Authorization: Bearer $M1T")
print_result "Member got a resource notification" "\"type\":\"resource\"" "$M1_NOTIFS"
print_result "Notification names the file" "shared-notes-${TS}" "$M1_NOTIFS"

echo ""
echo "[ 2 ] Promoting the member notifies them (role change)"
curl -s -X PATCH "$BASE_URL/groups/$GID/members/$M1ID/role" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" -d '{"membership_role":"leader"}' > /dev/null
M1_NOTIFS2=$(curl -s -X GET "$BASE_URL/notifications/$M1ID" -H "Authorization: Bearer $M1T")
print_result "Member notified of role change" "Your group role changed" "$M1_NOTIFS2"

echo ""
echo "[ 3 ] Removing the member notifies them"
curl -s -X DELETE "$BASE_URL/groups/$GID/members/$M1ID" -H "Authorization: Bearer $LT" > /dev/null
M1_NOTIFS3=$(curl -s -X GET "$BASE_URL/notifications/$M1ID" -H "Authorization: Bearer $M1T")
print_result "Removed member notified" "Removed from a group" "$M1_NOTIFS3"

echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
