#!/bin/bash
# ===========================================================================
# StudySync - Campus Feed (social) Notification Preference Tests (refinement R2)
# Verifies the new 'social' preference: default ON, persists, and is enforced —
# a user with it OFF gets no social notification, while a user with it ON does.
# Run: bash tests/curl/social-pref/test_social_pref.sh
# ===========================================================================

BASE_URL="http://localhost:8000"
PASS=0
FAIL=0
TS=$(date +%s)

print_result() { local l=$1 e=$2 a=$3; if echo "$a" | grep -q "$e"; then echo "  ✅ PASS — $l"; PASS=$((PASS+1)); else echo "  ❌ FAIL — $l"; echo "     Expected: $e"; echo "     Got: $a"; FAIL=$((FAIL+1)); fi; }
absent_result() { local l=$1 n=$2 a=$3; if echo "$a" | grep -q "$n"; then echo "  ❌ FAIL — $l"; echo "     Did NOT expect: $n"; echo "     Got: $a"; FAIL=$((FAIL+1)); else echo "  ✅ PASS — $l"; PASS=$((PASS+1)); fi; }
json_get() { echo "$1" | grep -o "\"$2\":[ ]*\"[^\"]*\"" | head -1 | sed "s/.*:[ ]*\"//;s/\"//"; }
reg() { local body="$1" resp; for _ in $(seq 1 6); do resp=$(curl -s -X POST "$BASE_URL/auth/register" -H "Content-Type: application/json" -d "$body"); echo "$resp" | grep -qi "too many" || { echo "$resp"; return; }; sleep 20; done; echo "$resp"; }

echo ""
echo "=============================="
echo "  CAMPUS FEED PREFERENCE TESTS"
echo "=============================="

echo ""
echo "[ setup ] Register two users A and B"
A=$(reg "{\"name\":\"Soc A\",\"email\":\"soc_a_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
AT=$(json_get "$A" access_token); AID=$(json_get "$A" user_id)
B=$(reg "{\"name\":\"Soc B\",\"email\":\"soc_b_${TS}@yorku.ca\",\"password\":\"Password1\",\"role\":\"student\"}")
BT=$(json_get "$B" access_token); BID=$(json_get "$B" user_id)
print_result "Users registered" "access_token" "$B"

echo ""
echo "[ 1 ] 'social' preference exists and defaults ON"
PREFS=$(curl -s -X GET "$BASE_URL/notification-preferences/$AID" -H "Authorization: Bearer $AT")
print_result "social defaults ON" "\"social\":true" "$PREFS"

echo ""
echo "[ 2 ] A turns social OFF; it persists"
UPD=$(curl -s -X PATCH "$BASE_URL/notification-preferences/$AID" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AT" -d '{"social":false}')
print_result "social now OFF" "\"social\":false" "$UPD"
REGET=$(curl -s -X GET "$BASE_URL/notification-preferences/$AID" -H "Authorization: Bearer $AT")
print_result "persists on re-fetch" "\"social\":false" "$REGET"

echo ""
echo "[ 3 ] B sends A a friend request — A (social OFF) gets NO notification"
curl -s -X POST "$BASE_URL/social/friends/$AID" -H "Authorization: Bearer $BT" > /dev/null
A_NOTIFS=$(curl -s -X GET "$BASE_URL/notifications/$AID" -H "Authorization: Bearer $AT")
absent_result "No friend-request notification for A" "friend request" "$A_NOTIFS"

echo ""
echo "[ 4 ] A accepts — B (social ON) DOES get a social notification"
curl -s -X POST "$BASE_URL/social/friends/$BID/accept" -H "Authorization: Bearer $AT" > /dev/null
B_NOTIFS=$(curl -s -X GET "$BASE_URL/notifications/$BID" -H "Authorization: Bearer $BT")
print_result "B notified of acceptance" "Friend request accepted" "$B_NOTIFS"
print_result "Notification is type social" "\"type\":\"social\"" "$B_NOTIFS"

echo ""
echo "=============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=============================="
echo ""
