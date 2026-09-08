#!/usr/bin/env bash
# 법률문서 릴리스 게이트(부분) — 자리표시자/가짜 전화가 0건인지 검사.
# 범위 밖(만14세·홈페이지·증적)은 다음 세션. 여기선 문서 확정만 판정한다.
#
# ⚠️ 대괄호 토큰은 접두 매칭으로 검사한다 — `[병원 확정 필요: 보존기간]`처럼 콜론 접미사가 붙은
#    변형까지 잡기 위함(정확 `[병원 확정 필요]`만 보면 놓친다).
set -euo pipefail

cd "$(dirname "$0")/.."

PATTERN='\[확인 필요|\[병원 확정 필요|\[병원 확인 필요|준비 중|02-000-0000|02-0000-0000'
TARGETS=(docs/legal patient_app/assets/legal)

hits=$(grep -rnE "$PATTERN" "${TARGETS[@]}" || true)
if [ -n "$hits" ]; then
  echo "❌ 릴리스 게이트 실패 — 자리표시자 잔존:"
  echo "$hits"
  exit 1
fi
echo "✅ 릴리스 게이트 통과 — 자리표시자 0건 (docs/legal + patient_app/assets/legal)"
