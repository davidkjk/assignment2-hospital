-- 되묻기 계기판(a) — chat_messages.route_taken에 'needs_clarification' 허용값 추가.
--
-- 배경: 봇이 애매한 질문에 되묻는 needs_clarification(검색-전=이해기 topic 판단, 검색-후=rag_service
--   NEEDS_CLARIFY)은 지금까지 route_taken='rag'(일반 답변)로 저장돼, 로그·통계에서 일반 답변과
--   구분되지 않았다. 전면 통합(llm 이해기)을 켠 뒤 "불필요한 되묻기가 늘지 않는지" 모니터링하려면
--   되묻기를 셀 수 있어야 한다(완료판정 지표, 리포트 §9.6 위험 #2).
-- 수정: 되묻기 봇 메시지를 route_taken='needs_clarification'로 저장하도록 제약을 확장한다
--   (orchestrator.orchestrate가 두 되묻기 경로에 이 값을 실어 준다). 추가 허용만·기존 값 불변·
--   되돌림 가능·데이터 무변경. 프론트 로그뷰는 계약 밖 값도 그대로 실어 표시하므로 무해
--   (staffChatLog.ts 주석: 계약 밖 값도 버리지 않고 EXC로 표시).
-- 계기판(집계 예): 최근 7일 되묻기 비율
--   select count(*) filter (where route_taken='needs_clarification')::float
--          / nullif(count(*) filter (where sender_type='bot'),0) as clarify_rate
--     from chat_messages where created_at >= now() - interval '7 days';
-- ⚠️ 원격 미적용 — 로컬만 apply, 배포 시 db push(MIGRATION-LEDGER 갱신은 main에서).

alter table chat_messages drop constraint chat_messages_route_taken_check;
alter table chat_messages add constraint chat_messages_route_taken_check
  check (route_taken in ('emergency', 'rag', 'department_guide', 'agent', 'handoff', 'no_answer', 'needs_clarification'));
