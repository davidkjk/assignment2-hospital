# 핸드오프 메모

## 진행 상태 (갱신: 2026-07-30)

**요구사항 원문(`docs/고객요구사항.txt`) vs 스펙 문서 한 줄씩 대조 검토, 3.10절까지 완료.** 발견된 갭 17건 전부 사용자 결정 완료 후 문서 반영도 전부 끝남(Group A~F, 아래 커밋 참고).

- **Group A** DB/스키마(`foundation-auth-data-model*.md`) — 완료: 6.1 RLS(사전문진 담당의사 한정), 3.7 `is_day_off`(정기 휴진 반복설정, 마이그레이션 `00009` + 테스트 2건, 백엔드 전체 97개 PASS). 커밋 `bd0fe96`/`b213974`.
- **Group B** 직원웹(`staff-web*.md`) — 완료: 3.5 전역 환자검색 화면, 3.10 오래대기 건수 통계, 3.7 정기휴진 체크박스 UI. 커밋 `bc2b314`/`53bbc00`.
- **Group C** 환자앱(`patient-app*.md`) — 완료: 4.5 홈카드 변경·취소 버튼, 7절 취소 확인 다이얼로그. 커밋 `5aaee12`.
- **Group D** 챗봇(`ai-chatbot*.md`) — 완료: 티켓상태·시각구분·CSV·드릴다운, 전체질문순위 통계, KB category 2건(진료과·의사소개/자주묻는질문). 커밋 `2722183`/`076850b`.
- **Group E** 검수·테스트(`deployment.md`) — 완료: 시나리오2 문진→행동형 연계 테스트, 시나리오9 `GET /staff` 403 테스트. 커밋 `4158bb1`.
- **Group F** 자투리 스펙 문장 보강(4건) — 완료: 4.6 환자공개 안내문 입력란(`patient_visible_notes`), 5.2 챗봇 처리대상 예시 9개 전체 나열, 6.5 비밀번호 평문조회 불가 문구, 7절 빠른입력 UX 메모. 커밋 `83f6ba7`.

**환자 노출 문구 원칙**(전 단계 공통): "취소 요청이 접수/등록됐다" 표현 금지, "상담(직원 확인)으로 연결됐다"만 사용.

## 구현 단계 현황 (2026-07-30 검증)

실제 코드가 존재하는 건 **1단계(`backend/`, `supabase/migrations/`)뿐**. 2~4단계(직원웹/환자앱/챗봇)는 디렉토리조차 없음 — 전부 문서(spec+plan) 단계. `deployment.md` 안의 테스트 코드(`test_scenario_09_permissions.py` 등)도 아직 예시 코드일 뿐 실존 파일 아님.

로컬 Supabase는 지난 세션에서 `supabase start`로 띄웠음(`backend/.env`·`backend/.venv` 생성, 둘 다 gitignore 대상). 다음 세션에서 백엔드 테스트 돌리려면 `supabase status`로 먼저 확인.

## 다음 액션

두 갈래 중 선택 필요 (사용자와 상의):

1. **요구사항 대조 이어가기** — 3.11절 이후(또는 4장 등) 아직 미착수. 지금까지 3.1~3.10, 4.4~4.6, 5.2~5.3, 6.1~6.2, 6.5, 7절, 시나리오 2/6/9/10을 대조했음. 남은 절 확인 필요.
2. **구현 착수** — 문서(spec+plan)는 1~5단계 모두 완료 상태이므로, `superpowers:writing-plans`로 계획 최종 점검 후 `subagent-driven-development`/`executing-plans`로 Task 1부터 순서대로 실행 가능. 1단계(DB)는 이미 코드 존재, 2~4단계부터 신규 구현.

**작업 종류별 스킬 구분(섞지 말 것):**

| 수정 대상 | 스킬 | 시점 |
|---|---|---|
| specs 문서(`docs/superpowers/specs/*-design.md`) | `superpowers:brainstorming` | 문장 고치기 전 |
| plans 문서(`docs/superpowers/plans/*.md`) | `superpowers:writing-plans` | specs 반영 후, Task 추가/수정 전 |
| 실제 코드(마이그레이션·백엔드·프론트) | `superpowers:test-driven-development` | Task 실행 시, 실패 테스트부터 |

여러 서브에이전트를 병렬로 띄울 경우, 전역 지침(`~/.claude/CLAUDE.md`)에 따라 **개수·범위·예상 작업량을 먼저 보고하고 승인 후에만** Agent 호출.

## 참고 파일 경로

- 1단계 스펙/계획: `docs/superpowers/specs/2026-07-27-foundation-auth-data-model-design.md` / `docs/superpowers/plans/2026-07-27-foundation-auth-data-model.md`
- 2단계 스펙/계획: `docs/superpowers/specs/2026-07-27-staff-web-design.md` / `docs/superpowers/plans/2026-07-27-staff-web.md`
- 3단계 스펙/계획: `docs/superpowers/specs/2026-07-27-patient-app-design.md` / `docs/superpowers/plans/2026-07-27-patient-app.md`
- 4단계 스펙/계획: `docs/superpowers/specs/2026-07-27-ai-chatbot-design.md` / `docs/superpowers/plans/2026-07-27-ai-chatbot.md`
- 배포 계획: `docs/superpowers/plans/2026-07-27-deployment.md`
- 요구사항 원문: `docs/고객요구사항.txt`
