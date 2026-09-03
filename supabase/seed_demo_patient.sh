#!/usr/bin/env bash
# ============================================================================
# seed_demo_patient.sh — 환자앱 데모 계정(010-1234-5678 / demo1234)을 원격에 프로비저닝한다 (SP2).
# ----------------------------------------------------------------------------
# 두 단계:
#   ① 전화 인증 auth.users 를 Supabase Admin API로 만든다(phone_confirm=true → 문자 없이 로그인).
#      - 앱 로그인은 signInWithPassword(phone, password) 이므로 비밀번호(demo1234)가 있어야 한다.
#      - GoTrue가 필요한 컬럼·아이덴티티를 알아서 채우므로 auth.users 직접 INSERT보다 안전하다.
#   ② 그 사용자의 UID를 psql 변수로 넘겨 seed_demo_patient.sql 을 적재한다(patients 계정 연결 + 데이터).
#
# 멱등: 이미 있으면 만들지 않고 UID를 찾아 비밀번호·phone_confirm만 다시 맞춘다. SQL도 멱등(고정 UUID).
#
# ⚠️ seed_demo.sql(전체 재시드)의 PREAMBLE은 `delete from patients`로 이 데모 환자도 지운다.
#    → 전체 재시드 뒤에는 이 스크립트를 다시 돌려야 한다(seed-demo-remote.sh 끝에서 자동 호출).
#    auth.users(전화)는 프리앰블이 안 지우므로 ①은 재실행 시 사실상 no-op이 된다.
#
# 필요 환경변수(전부 원격 값 — seed-demo-remote.sh와 같은 이름):
#   REMOTE_DATABASE_URL     원격 DB 접속 문자열(postgres 역할, 세션풀러 5432).
#   REMOTE_SUPABASE_URL     원격 프로젝트 URL. 예: https://<ref>.supabase.co
#   REMOTE_SERVICE_ROLE_KEY 원격 service_role 키(Admin API용).
#
# 선택 환경변수:
#   DEMO_PHONE     기본 +821012345678 (E.164)
#   DEMO_PASSWORD  기본 demo1234
#
# 사용:
#   REMOTE_DATABASE_URL=... REMOTE_SUPABASE_URL=... REMOTE_SERVICE_ROLE_KEY=... \
#     bash supabase/seed_demo_patient.sh
# ============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${REMOTE_DATABASE_URL:?REMOTE_DATABASE_URL이 필요합니다(원격 DB 접속 문자열, postgres 역할)}"
: "${REMOTE_SUPABASE_URL:?REMOTE_SUPABASE_URL이 필요합니다(예: https://<ref>.supabase.co)}"
: "${REMOTE_SERVICE_ROLE_KEY:?REMOTE_SERVICE_ROLE_KEY가 필요합니다(원격 service_role 키)}"

DEMO_PHONE="${DEMO_PHONE:-+821012345678}"
DEMO_PASSWORD="${DEMO_PASSWORD:-demo1234}"
PHONE_NO_PLUS="${DEMO_PHONE#+}"                 # GoTrue는 phone을 '+' 없이 저장한다(821012345678)
AUTH="${REMOTE_SUPABASE_URL%/}/auth/v1/admin/users"

if ! command -v psql >/dev/null 2>&1; then
  echo "✗ psql이 없습니다. postgresql-client를 설치하세요(brew install libpq 등)." >&2
  exit 1
fi

# psql로 UID 한 값만 조용히 뽑는 헬퍼(-tA = 튜플만·정렬없음).
lookup_uid() {
  psql "$REMOTE_DATABASE_URL" -tAqc \
    "select id from auth.users where phone in ('$PHONE_NO_PLUS', '$DEMO_PHONE') order by created_at limit 1"
}

echo "▶ ① 전화 인증 계정 확인/생성 중… ($DEMO_PHONE)"
UID_VAL="$(lookup_uid || true)"

if [ -z "$UID_VAL" ]; then
  echo "  · 없음 → Admin API로 생성"
  curl -fsS -X POST "$AUTH" \
    -H "apikey: $REMOTE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $REMOTE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$DEMO_PHONE\",\"password\":\"$DEMO_PASSWORD\",\"phone_confirm\":true}" \
    >/dev/null
  UID_VAL="$(lookup_uid || true)"
  if [ -z "$UID_VAL" ]; then
    echo "✗ 생성 후에도 UID를 못 찾았습니다. Admin API 응답/전화 형식을 확인하세요." >&2
    exit 1
  fi
  echo "  · 생성 완료 UID=$UID_VAL"
else
  echo "  · 이미 있음 UID=$UID_VAL"
fi

# 생성/기존 경로 무관하게 비밀번호(demo1234)·phone_confirm을 항상 보장한다(멱등).
# 이유: ① 기존 계정은 비밀번호를 모를 수 있고 ② 일부 GoTrue 버전은 create 시 phone_confirm을
#   무시해 미확인 상태로 남는다(그러면 signInWithPassword가 400 phone_not_confirmed).
curl -fsS -X PUT "$AUTH/$UID_VAL" \
  -H "apikey: $REMOTE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $REMOTE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$DEMO_PASSWORD\",\"phone_confirm\":true}" \
  >/dev/null || echo "  ⚠ 비밀번호·확인 상태 PUT 실패(로그인이 안 되면 대시보드에서 수동 확인)." >&2

echo "▶ ② 환자 데이터 적재 중… (seed_demo_patient.sql, UID 연결)"
PGTZ=Asia/Seoul psql "$REMOTE_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -v demo_auth_uid="$UID_VAL" -f "$DIR/seed_demo_patient.sql"

echo "✅ 데모 환자 준비 완료 — 환자앱에서 $DEMO_PHONE / $DEMO_PASSWORD 로 로그인하세요."
