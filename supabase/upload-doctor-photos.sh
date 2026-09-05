#!/usr/bin/env bash
# ============================================================================
# upload-doctor-photos.sh — 데모 의사 실사진(D-4)을 doctor-photos 버킷에 올린다.
# ----------------------------------------------------------------------------
# 왜 필요한가: staff.photo_url은 파일이 아니라 "공개 URL"만 가리킨다(00042·staff_profile).
#   실제 사진 파일은 Supabase Storage 버킷에 있어야 환자앱 아바타(NetworkImage)가 뜬다.
#   seed_demo.sql이 넣는 photo_url(/storage/v1/object/public/doctor-photos/*.jpg)이
#   실제로 서빙되도록, 데모 사진 7장(demo/public/doctors/*.jpg)을 여기서 업로드한다.
#   재시드마다 storage.objects 행이 사라지므로 seed-demo.sh가 이 스크립트를 함께 부른다.
#
# 프로덕션에선 안 쓴다 — 실제 사진은 관리자가 /admin/staff 프로필에서 올린다(staff_profile.upload_photo).
#
# 환경변수(선택):
#   SUPABASE_URL           기본 http://127.0.0.1:54321 (호스트에서 실행 기준)
#   SUPABASE_SERVICE_KEY   기본 = 로컬 supabase-demo 표준 service_role 키(공개값)
# ============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTOS_DIR="$DIR/../demo/public/doctors"
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
# 로컬 supabase-demo 전용 공개 키(실제 비밀 아님 — seed_demo.sql anon 키와 같은 데모 쌍).
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"

if [ ! -d "$PHOTOS_DIR" ]; then
  echo "⚠ 사진 폴더가 없어 건너뜁니다: $PHOTOS_DIR" >&2
  exit 0
fi

echo "▶ 의사 사진 업로드 중… (버킷: doctor-photos, URL: $SUPABASE_URL)"
uploaded=0
for f in "$PHOTOS_DIR"/*.jpg; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$SUPABASE_URL/storage/v1/object/doctor-photos/$name" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "x-upsert: true" \
    -H "Content-Type: image/jpeg" \
    --data-binary "@$f")"
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    uploaded=$((uploaded + 1))
  else
    echo "  ✗ $name 업로드 실패(HTTP $code)" >&2
  fi
done

echo "✅ 의사 사진 ${uploaded}장 업로드 완료."
