#!/usr/bin/env bash
# 법률문서 릴리스 게이트 — 자리표시자/가짜 전화가 0건인지 검사.
# 범위: docs/legal 정본 + 앱 동의문서(patient_app/assets/legal) + 홈페이지 공개 법률 페이지
#       (homepage/privacy.html·terms.html). ⚠️ homepage/index.html은 제외 — 앱스토어
#       "준비 중" 마케팅 문구가 있어 오탐이 난다(법률 페이지만 검사).
#
# ⚠️ 대괄호 토큰은 접두 매칭으로 검사한다 — `[병원 확정 필요: 보존기간]`처럼 콜론 접미사가 붙은
#    변형과 `[법정대리인 입력]`류 입력 자리표시자까지 잡기 위함.
set -euo pipefail

cd "$(dirname "$0")/.."

PATTERN='\[확인 필요|\[병원 확정 필요|\[병원 확인 필요|\[법정대리인 입력|\[가입 과정에서 입력|\[서버 자동 기록|준비 중|02-000-0000|02-0000-0000'
TARGETS=(docs/legal patient_app/assets/legal homepage/privacy.html homepage/terms.html)

hits=$(grep -rnE "$PATTERN" "${TARGETS[@]}" || true)
if [ -n "$hits" ]; then
  echo "❌ 릴리스 게이트 실패 — 자리표시자 잔존:"
  echo "$hits"
  exit 1
fi
echo "✅ 릴리스 게이트 통과 — 자리표시자 0건 (docs/legal + patient_app/assets/legal + homepage 법률 페이지)"
