#!/bin/bash
# ===========================================================================
# StudySynq - Download, Preview & Upload Stats Tests
# Covers:
# - US-D.3 Download & File Preview
# - US-D.5 Upload Activity & Storage Stats
# @author: Fahad Sohail
#
# Download/preview and the stats widget are both driven client-side off
# GET /groups/:id/resources and GET /resources/:id (there is no separate
# download or stats endpoint), so this suite checks that those responses
# carry the right file_url/file_type/uploaded_by/created_at data, in the
# right order and with the right access control, for those UI features
# to work.
#
# Run:
#   bash tests/curl/resources/test_download_preview_stats.sh
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

index_of() {
  local haystack="$1" needle="$2"
  local prefix="${haystack%%"$needle"*}"
  if [ "$prefix" = "$haystack" ]; then
    echo -1
  else
    echo "${#prefix}"
  fi
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
echo "  DOWNLOAD / PREVIEW / STATS TESTS"
echo "  US-D.3 | US-D.5"
echo "========================================"

LEADER_EMAIL="dl_leader_${TS}@yorku.ca"
MEMBER_EMAIL="dl_member_${TS}@yorku.ca"
OUTSIDER_EMAIL="dl_outsider_${TS}@yorku.ca"
PASSWORD="Password1"

echo ""
echo "[ setup ] Register users"
LEADER=$(reg "{\"name\":\"DL Leader\",\"email\":\"$LEADER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"group_leader\"}")
LT=$(json_get "$LEADER" access_token)

MEMBER=$(reg "{\"name\":\"DL Member\",\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
MT=$(json_get "$MEMBER" access_token)

OUTSIDER=$(reg "{\"name\":\"DL Outsider\",\"email\":\"$OUTSIDER_EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"student\"}")
OTK=$(json_get "$OUTSIDER" access_token)

print_result "Leader registered" "access_token" "$LEADER"
print_result "Member registered" "access_token" "$MEMBER"
print_result "Outsider registered" "access_token" "$OUTSIDER"

if [ -z "$LT" ] || [ -z "$MT" ] || [ -z "$OTK" ]; then
  echo "Setup failed because a token was missing."
  exit 1
fi

echo ""
echo "[ setup ] Create group and join member"
GROUP=$(curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LT" \
  -d "{\"name\":\"Download Stats Test ${TS}\",\"is_public\":true}")

GID=$(json_get "$GROUP" id)
print_result "Group created" "id" "$GROUP"

curl -s -X POST "$BASE_URL/groups/$GID/join" -H "Authorization: Bearer $MT" > /dev/null

echo ""
echo "-----------------------------"
echo " US-D.3: Download & File Preview"
echo "-----------------------------"

echo ""
echo "[ D3-1 ] Upload a PDF resource"
PDF=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/resources?file_name=lecture-notes-${TS}.pdf&file_url=https://example.com/lecture-notes-${TS}.pdf&file_type=pdf" \
  -H "Authorization: Bearer $LT")
check_status "PDF upload handled" "$(status_code "$PDF")" "200" "201"
PDF_BODY=$(body_only "$PDF")
PDF_ID=$(json_get "$PDF_BODY" id)

echo ""
echo "[ D3-2 ] Upload an image resource"
IMG=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/groups/$GID/resources?file_name=whiteboard-${TS}.png&file_url=https://example.com/whiteboard-${TS}.png&file_type=image" \
  -H "Authorization: Bearer $MT")
check_status "Image upload handled" "$(status_code "$IMG")" "200" "201"
IMG_BODY=$(body_only "$IMG")
IMG_ID=$(json_get "$IMG_BODY" id)

echo ""
echo "[ D3-3 ] Fetching the PDF resource resolves to its exact file_url and type"
PDF_GET=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/resources/$PDF_ID" \
  -H "Authorization: Bearer $MT")
check_status "Group member can fetch resource for download/preview" "$(status_code "$PDF_GET")" "200"
PDF_GET_BODY=$(body_only "$PDF_GET")
print_result "Download link resolves to the correct file_url" "https://example.com/lecture-notes-${TS}.pdf" "$PDF_GET_BODY"
print_result "Resource reports pdf file_type for preview logic" "\"file_type\":\"pdf\"" "$PDF_GET_BODY"

echo ""
echo "[ D3-4 ] Fetching the image resource reports its concrete file_type for inline preview"
IMG_GET=$(curl -s -X GET "$BASE_URL/resources/$IMG_ID" -H "Authorization: Bearer $MT")
# file_type is normalized to the concrete extension (e.g. "png"), not the
# broad "image" category — that grouping only applies to the ?type= list filter.
print_result "Image resource reports png file_type" "\"file_type\":\"png\"" "$IMG_GET"
print_result "Image download link is correct" "https://example.com/whiteboard-${TS}.png" "$IMG_GET"

echo ""
echo "[ D3-5 ] Non-member is blocked from downloading/previewing the resource"
OUTSIDER_GET=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/resources/$PDF_ID" \
  -H "Authorization: Bearer $OTK")
check_status "Outsider blocked from resource" "$(status_code "$OUTSIDER_GET")" "401" "403"

echo ""
echo "[ D3-6 ] Fetching a non-existent resource returns 404"
MISSING=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/resources/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $LT")
check_status "Missing resource returns 404" "$(status_code "$MISSING")" "404"

echo ""
echo "-----------------------------"
echo " US-D.5: Upload Activity & Storage Stats"
echo "-----------------------------"

echo ""
echo "[ D5-1 ] Upload a third resource so the group has a mixed set (2 leader, 1 member)"
sleep 1
LINK=$(curl -s -X POST "$BASE_URL/groups/$GID/resources?file_name=syllabus-link-${TS}&file_url=https://example.com/syllabus-${TS}&file_type=link" \
  -H "Authorization: Bearer $LT")
print_result "Third resource uploaded" "syllabus-link-${TS}" "$LINK"

echo ""
echo "[ D5-2 ] Group resource feed returns every upload with the fields the stats widget needs"
FEED=$(curl -s -X GET "$BASE_URL/groups/$GID/resources" -H "Authorization: Bearer $LT")
COUNT=$(echo "$FEED" | grep -o '"id"' | wc -l | tr -d ' ')
if [ "$COUNT" = "3" ]; then
  echo "  PASS - Total resource count for the group is 3"; PASS=$((PASS+1))
else
  echo "  FAIL - Total resource count for the group is 3"
  echo "     Got: $COUNT"
  FAIL=$((FAIL+1))
fi
print_result "Feed carries uploaded_by for per-uploader breakdown" "uploaded_by" "$FEED"
print_result "Feed carries created_at for the recent-uploads list" "created_at" "$FEED"
print_result "Feed carries file_type for the per-type breakdown" "file_type" "$FEED"

echo ""
echo "[ D5-3 ] Feed is ordered most-recent-first, matching the 'recent uploads' widget"
IDX_LINK=$(index_of "$FEED" "syllabus-link-${TS}")
IDX_IMG=$(index_of "$FEED" "whiteboard-${TS}.png")
IDX_PDF=$(index_of "$FEED" "lecture-notes-${TS}.pdf")
if [ "$IDX_LINK" -ge 0 ] && [ "$IDX_IMG" -ge 0 ] && [ "$IDX_PDF" -ge 0 ] && [ "$IDX_LINK" -lt "$IDX_IMG" ] && [ "$IDX_IMG" -lt "$IDX_PDF" ]; then
  echo "  PASS - Most recently uploaded resource (syllabus link) appears first"; PASS=$((PASS+1))
else
  echo "  FAIL - Most recently uploaded resource (syllabus link) appears first"
  echo "     Got offsets: link=$IDX_LINK image=$IDX_IMG pdf=$IDX_PDF"
  FAIL=$((FAIL+1))
fi

echo ""
echo "[ D5-4 ] Non-member cannot pull the group's resource feed (stats stay leader/member-only)"
OUTSIDER_FEED=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$BASE_URL/groups/$GID/resources" \
  -H "Authorization: Bearer $OTK")
check_status "Outsider blocked from resource feed" "$(status_code "$OUTSIDER_FEED")" "401" "403"

echo ""
echo "========================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
