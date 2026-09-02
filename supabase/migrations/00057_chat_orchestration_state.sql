-- 3-A 오케스트레이션 state (설계결정): 문진 진행을 세션에 못박아 재분류 누수를 막는다. route는 메시지에 기록.
-- 번호 00057 = MIGRATION-LEDGER 정본(챗봇 00053~00059, chat_orchestration_state). 플랜 산문 00056은 +1로 읽는다.
alter table ai_chat_sessions
  add column active_flow text check (active_flow in ('department_guide')),
  add column flow_step int not null default 0,
  add column flow_collected jsonb not null default '{}'::jsonb;
alter table chat_messages
  add column route_taken text check (route_taken in ('emergency', 'rag', 'department_guide', 'agent', 'handoff'));
