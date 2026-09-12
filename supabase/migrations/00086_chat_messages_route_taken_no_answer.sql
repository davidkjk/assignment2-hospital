-- ⭐ WEBCHAT-NOANS(no_answer 칩) — chat_messages.route_taken에 'no_answer' 허용값 추가.
--
-- 배경: no_answer 칩(결정 2026-09-04)으로 봇이 답을 못 찾으면 자동 인계·자동 티켓을 폐기하고,
--   봇 안내 말풍선(text) + quick_replies 카드(FAQ 칩 + [직원에게 연결])를 route_taken='no_answer'로
--   저장한다(chat_flow_service.handle_message, orchestrator.orchestrate). 그런데 route_taken의 CHECK
--   제약(00057_chat_orchestration_state.sql)은 ('emergency','rag','department_guide','agent','handoff')
--   다섯 값만 허용해, no_answer 경로가 봇 메시지를 저장하는 순간 chat_messages_route_taken_check 위반으로
--   500이 난다. 즉 no_answer 흐름 전체가 런타임에 깨진다.
-- 함정: A-①(no_answer 칩)은 코드(safety_watchdog·orchestrator·chat_flow_service)와 00085(unresolved
--   nullable)만 넣고 이 제약 확장을 빠뜨렸다. mock 단위테스트는 DB를 안 타 통과했고, 이 결함은
--   DB 통합테스트(test_chat_integration::test_no_answer_...)만 잡는다 — Docker 다운으로 그 테스트가
--   로컬에서 못 돌아 가려져 있었다(2026-09-05 Docker 복구 후 재검증에서 발견).
-- 수정: 제약을 drop 후 'no_answer'를 더해 재생성한다. 추가 허용만·기존 값 불변·되돌림 가능·데이터 무변경.
-- ⚠️ 원격 미적용 — 로컬만 apply, 배포 시 db push(MIGRATION-LEDGER 갱신은 main에서).

alter table chat_messages drop constraint chat_messages_route_taken_check;
alter table chat_messages add constraint chat_messages_route_taken_check
  check (route_taken in ('emergency', 'rag', 'department_guide', 'agent', 'handoff', 'no_answer'));
