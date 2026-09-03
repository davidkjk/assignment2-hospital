#!/usr/bin/env bash
# ============================================================================
# seed-demo-remote.sh — 데모 시드를 "원격" Supabase에 적재한다 (배포 Task 13 Step 5).
# ----------------------------------------------------------------------------
# seed-demo.sh는 로컬 docker 컨테이너 전용(docker exec)이라 원격엔 못 쓴다. 이 스크립트는
# 원격 DB에 psql로 직접 접속해 같은 시드 SQL을 적재하고, 의사 사진을 원격 버킷에 올린다.
#
# 시드는 상대 시각(current_date·now())을 쓴다 → 적재하는 그 순간이 「데모의 지금」.
# 병원 운영시간(09~18, Asia/Seoul) 안에 돌려야 화면이 자연스럽게 북적인다.
#
# 함정 방지(HANDOFF ⚠️):
#   · PGTZ=Asia/Seoul  — UTC로 넣으면 시드의 "내일"이 "오늘"이 되어 타일이 0으로 뜬다.
#   · ON_ERROR_STOP=1  — 중간 실패 시 트랜잭션 통째 롤백(staff 비어 로그인 401 사고 방지).
#   · seed_demo.sql은 auth.users를 직접 INSERT(bcrypt)한다 → postgres 역할로 접속해야 한다.
#
# 필요 환경변수(전부 원격 값 — 사용자 대시보드/비번관리자에서):
#   REMOTE_DATABASE_URL     원격 DB 접속 문자열(postgres 역할).
#                             예: postgresql://postgres:<암호>@db.<ref>.supabase.co:5432/postgres
#                             (또는 대시보드 Connection string의 Session pooler URL)
#   REMOTE_SUPABASE_URL     원격 프로젝트 URL. 예: https://<ref>.supabase.co
#   REMOTE_SERVICE_ROLE_KEY 원격 service_role 키(Storage 업로드용).
#
# 사용:
#   REMOTE_DATABASE_URL=... REMOTE_SUPABASE_URL=... REMOTE_SERVICE_ROLE_KEY=... \
#     bash supabase/seed-demo-remote.sh
# ============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${REMOTE_DATABASE_URL:?REMOTE_DATABASE_URL이 필요합니다(원격 DB 접속 문자열, postgres 역할)}"
: "${REMOTE_SUPABASE_URL:?REMOTE_SUPABASE_URL이 필요합니다(예: https://<ref>.supabase.co)}"
: "${REMOTE_SERVICE_ROLE_KEY:?REMOTE_SERVICE_ROLE_KEY가 필요합니다(원격 service_role 키)}"

if ! command -v psql >/dev/null 2>&1; then
  echo "✗ psql이 없습니다. postgresql-client를 설치하세요(brew install libpq 등)." >&2
  exit 1
fi

echo "▶ 원격 기본 시드 적재 중… (seed_demo.sql)"
PGTZ=Asia/Seoul psql "$REMOTE_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/seed_demo.sql"

echo "▶ 의사 실사진 업로드 중… (원격 doctor-photos 버킷)"
SUPABASE_URL="$REMOTE_SUPABASE_URL" SUPABASE_SERVICE_KEY="$REMOTE_SERVICE_ROLE_KEY" \
  bash "$DIR/upload-doctor-photos.sh" \
  || echo "⚠ 의사 사진 업로드를 건너뜀(사진은 회색 원으로 표시)." >&2

echo "▶ 상담봇 데모 데이터 적재 중… (seed_demo_chat.sql)"
if PGTZ=Asia/Seoul psql "$REMOTE_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/seed_demo_chat.sql"; then
  echo "  ✅ 상담봇 데모 데이터 적재 완료."
else
  echo "⚠ 상담봇 데모 시드를 건너뜀(기본 시드·로그인은 무사)." >&2
fi

# 환자앱 데모 계정(010-1234-5678) — 전화 인증 프로비저닝 + 풍부한 환자 데이터(SP2).
# ⚠️ 위 seed_demo.sql 프리앰블이 `delete from patients`로 이 환자를 지우므로 전체 재시드 끝에서 다시 넣는다.
echo "▶ 환자앱 데모 계정 적재 중… (seed_demo_patient.sh)"
if bash "$DIR/seed_demo_patient.sh"; then
  echo "  ✅ 환자앱 데모 계정 적재 완료."
else
  echo "⚠ 환자앱 데모 계정 적재를 건너뜀(직원웹·상담봇 데모는 무사)." >&2
fi

echo "✅ 원격 재적재 완료 — 지금 시각($(TZ=Asia/Seoul date '+%H:%M'), Asia/Seoul) 기준으로 데모 데이터가 깔렸습니다."
