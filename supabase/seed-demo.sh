#!/usr/bin/env bash
# ============================================================================
# seed-demo.sh — 데모 시드 재적재를 "한 줄"로.
# ----------------------------------------------------------------------------
# 시연 직전에 돌린다. 시드는 상대 시각(current_date·now())을 쓰므로 **재적재하는
# 그 순간이 곧 「데모의 지금」**이 된다. 병원 운영시간(09~18) 안에 돌리면 화면이
# 자연스럽게 북적인다(새벽·마감 후에 돌리면 "아직 시작 전"·"다 끝남"으로 보인다).
#
# 함정 방지(HANDOFF ⚠️ 1번):
#   · PGTZ=Asia/Seoul  — UTC로 넣으면 시드의 "내일"이 서버엔 "오늘"이 되어 타일이 0으로 뜬다.
#   · ON_ERROR_STOP=1  — 중간 실패 시 트랜잭션이 통째로 롤백(staff가 비어 로그인 401 되는 사고 방지).
#
# 사용:  bash supabase/seed-demo.sh
#        (또는 cd frontend && npm run seed:demo)
#   DB 컨테이너 이름이 다르면:  SEED_DB_CONTAINER=<이름> bash supabase/seed-demo.sh
# ============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${SEED_DB_CONTAINER:-supabase_db_foundation-auth-data-model}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ DB 컨테이너 '$CONTAINER'가 떠 있지 않습니다. 먼저 'supabase start'를 실행하세요." >&2
  echo "  (컨테이너 이름이 다르면 SEED_DB_CONTAINER 환경변수로 지정)" >&2
  exit 1
fi

echo "▶ 데모 시드 재적재 중… (컨테이너: $CONTAINER)"
docker exec -e PGTZ=Asia/Seoul -i "$CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$DIR/seed_demo.sql"

# 의사 실사진(D-4) — staff.photo_url이 가리키는 파일을 버킷에 올린다(재시드마다 storage.objects가 비므로).
# 실패해도 시드는 유효하다(사진만 회색 원으로 폴백) → set -e 아래서도 시드 성공을 막지 않게 감싼다.
bash "$DIR/upload-doctor-photos.sh" || echo "⚠ 의사 사진 업로드를 건너뜀(사진은 회색 원으로 표시)." >&2

echo "✅ 재적재 완료 — 지금 시각($(TZ=Asia/Seoul date '+%H:%M')) 기준으로 데모 데이터가 새로 깔렸습니다."
