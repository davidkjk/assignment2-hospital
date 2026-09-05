#!/usr/bin/env bash
# ============================================================================
# seed_demo_patient.sh — 환자앱 데모 계정을 원격에 프로비저닝한다 (SP2).
#   ⚠️ 전화번호·비밀번호는 파일에 하드코딩하지 않고 환경변수로만 주입한다(개인정보·공유비번 노출 방지, 코드리뷰 D#1).
# ----------------------------------------------------------------------------
# 두 단계:
#   ① 전화 인증 auth.users 를 Supabase Admin API로 만든다(phone_confirm=true → 문자 없이 로그인).
#      - 앱 로그인은 signInWithPassword(phone, password) 이므로 비밀번호(DEMO_PASSWORD)가 있어야 한다.
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
# 데모 계정 환경변수:
#   DEMO_PHONE          (필수) 데모 환자 전화번호 E.164. 예: +8210XXXXYYYY. ⚠️ 실제 번호를 파일 기본값으로 두지 않는다.
#   DEMO_PASSWORD       (선택) 데모 로그인 비밀번호. 미설정 시 무작위 생성 후 화면에 1회 출력. ⚠️ 고정 공유비번 금지.
#   DEMO_PHONE_DISPLAY  (선택) patients.phone에 저장할 표시 형식. 미설정 시 DEMO_PHONE에서 010-…-…로 변환.
#
# 안전 가드 환경변수(원격 대상일 때 — 코드리뷰 D#2):
#   DEMO_ALLOWED_PROJECT_REFS  (원격 필수) 데모용으로 허용된 Supabase project ref 목록(쉼표/공백 구분). 운영 DB 오적재 방지.
#   APPLY_GLOBAL_NOTIFY_LOCK   (선택) 1이면 대상 DB "전체" 환자 알림 OFF(데모 문자 안전장치)를 적용. 미설정 시 전역 변경은 건너뜀.
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

# 전화번호는 필수(파일 기본값에 실제 번호를 두지 않는다 — D#1).
: "${DEMO_PHONE:?DEMO_PHONE이 필요합니다(데모 환자 전화번호, E.164 예: +8210XXXXYYYY). 실제 번호를 파일 기본값으로 두지 않습니다.}"

# 비밀번호: 미설정이면 무작위 생성(고정 공유비번을 파일에 두지 않는다 — D#1). 생성값은 끝에서 1회 출력한다.
DEMO_PASSWORD="${DEMO_PASSWORD:-}"
DEMO_PW_GENERATED=0
if [ -z "$DEMO_PASSWORD" ]; then
  DEMO_PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"
  DEMO_PW_GENERATED=1
fi

PHONE_NO_PLUS="${DEMO_PHONE#+}"                 # GoTrue는 phone을 '+' 없이 저장한다(예: 8210XXXXYYYY)
AUTH="${REMOTE_SUPABASE_URL%/}/auth/v1/admin/users"

# patients.phone(표시·SMS 라우팅용) 표시 형식 — 명시 없으면 E.164(+8210…)를 국내 형식(010-….)으로 변환.
DEMO_PHONE_DISPLAY="${DEMO_PHONE_DISPLAY:-}"
if [ -z "$DEMO_PHONE_DISPLAY" ]; then
  if [[ "$PHONE_NO_PLUS" =~ ^8210([0-9]{4})([0-9]{4})$ ]]; then
    DEMO_PHONE_DISPLAY="010-${BASH_REMATCH[1]}-${BASH_REMATCH[2]}"
  else
    DEMO_PHONE_DISPLAY="$DEMO_PHONE"           # 변환 불가 시 원문 그대로(표시용)
  fi
fi

# ── 안전 가드(D#2): 이 스크립트/SQL은 대상 DB "전체" 환자의 알림을 끄는 데모 안전장치를 적용할 수 있다.
#    운영/공유 프로젝트에 실수로 실행되면 실제 환자 알림이 전부 꺼진다.
#    → 원격 대상이면 허용된 데모 project ref 목록에 속할 때만 진행하고, 전역 변경은 명시 동의가 있어야만 한다.
supa_host="${REMOTE_SUPABASE_URL#*://}"; supa_host="${supa_host%%/*}"; supa_host="${supa_host%%:*}"
IS_LOCAL=0
case "$supa_host" in
  localhost|127.0.0.1|0.0.0.0|kong|host.docker.internal|*.local) IS_LOCAL=1 ;;
esac
PROJECT_REF="${supa_host%%.*}"                  # https://<ref>.supabase.co → <ref>

if [ "$IS_LOCAL" != "1" ]; then
  : "${DEMO_ALLOWED_PROJECT_REFS:?DEMO_ALLOWED_PROJECT_REFS가 필요합니다 — 데모용으로 허용된 Supabase project ref 목록(쉼표/공백 구분). 운영 DB 오적재 방지(D#2).}"
  ref_ok=0
  for _ref in ${DEMO_ALLOWED_PROJECT_REFS//,/ }; do
    [ "$_ref" = "$PROJECT_REF" ] && ref_ok=1 && break
  done
  if [ "$ref_ok" != "1" ]; then
    echo "✗ 대상 프로젝트 ref '$PROJECT_REF'가 허용 목록(DEMO_ALLOWED_PROJECT_REFS)에 없습니다." >&2
    echo "  이 작업은 대상 DB 전체 환자의 알림을 끌 수 있어, 운영/공유 DB 오적재 방지를 위해 중단합니다." >&2
    echo "  데모 프로젝트가 맞다면 DEMO_ALLOWED_PROJECT_REFS 에 '$PROJECT_REF' 를 넣어 다시 실행하세요." >&2
    exit 1
  fi
fi

# 전역 알림 잠금(병원 마스터 스위치 OFF + 대상 DB 전체 prefs OFF)은 데모 안전장치의 핵심이지만
# 대상 DB 전체를 건드리는 파괴적 변경이다 → 로컬이거나, 명시 동의(APPLY_GLOBAL_NOTIFY_LOCK=1)가 있을 때만 적용.
APPLY_GLOBAL_LOCK=off
if [ "$IS_LOCAL" = "1" ]; then
  APPLY_GLOBAL_LOCK=on                          # 로컬은 운영 위험이 없으므로 자동 적용
elif [ "${APPLY_GLOBAL_NOTIFY_LOCK:-}" = "1" ] || [ "${APPLY_GLOBAL_NOTIFY_LOCK:-}" = "true" ]; then
  APPLY_GLOBAL_LOCK=on
fi

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

# 생성/기존 경로 무관하게 비밀번호(DEMO_PASSWORD)·phone_confirm을 항상 보장한다(멱등).
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
  -v demo_auth_uid="$UID_VAL" \
  -v demo_phone_display="$DEMO_PHONE_DISPLAY" \
  -v apply_global_lock="$APPLY_GLOBAL_LOCK" \
  -f "$DIR/seed_demo_patient.sql"

if [ "$DEMO_PW_GENERATED" = "1" ]; then
  echo "🔑 비밀번호를 무작위로 생성했습니다(파일에 저장 안 됨) — 이 값을 안전하게 보관하세요: $DEMO_PASSWORD"
fi
echo "✅ 데모 환자 준비 완료 — 환자앱에서 $DEMO_PHONE / $DEMO_PASSWORD 로 로그인하세요."
if [ "$APPLY_GLOBAL_LOCK" != "on" ]; then
  echo "⚠ 전역 알림 잠금을 적용하지 않았습니다(APPLY_GLOBAL_NOTIFY_LOCK 미설정)." >&2
  echo "  데모에서 문자 마스터 스위치를 켜면 다른 데모 환자에게도 문자가 나갈 수 있습니다 — 필요 시 APPLY_GLOBAL_NOTIFY_LOCK=1 로 다시 실행하세요." >&2
fi
