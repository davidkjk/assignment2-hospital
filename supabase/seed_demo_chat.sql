-- ============================================================================
-- seed_demo_chat.sql — 상담봇 문의 티켓함(/tickets) 데모 데이터 (상담봇 Task 16)
-- ----------------------------------------------------------------------------
-- 메인 seed_demo.sql "뒤에" 별도 트랜잭션으로 돈다 — 실패해도 직원·예약 시드는 무사하다
-- (ON_ERROR_STOP로 전체가 롤백돼 로그인이 깨지는 사고를 막는다).
-- 환자·접수/관리자·예약은 메인 시드에서 골라 참조한다.
--
-- 데모 4건: 새 문의(취소 상담·의료 판단) 2 · 처리 중(변경 상담) 1 · 답변 완료(일반) 1.
-- 접수시각을 벌려 접수순(created_at ASC)이 눈에 보이게 한다.
-- ============================================================================

begin;

-- 재실행 안전: 챗봇 데이터만 지운다. session↔ticket 순환 FK라 FK/트리거를 잠시 끈다
-- (핸드오프 정리 관례 · postgres 슈퍼유저에서만 가능). KB(kb_*)·qa_example_bank는 건드리지 않는다.
set session_replication_role = 'replica';
delete from chat_message_sources;
delete from answer_feedback;
delete from chat_quality_reviews;
delete from unresolved_questions;
delete from chat_messages;
delete from support_ticket_assignment_history;
delete from support_tickets;
delete from ai_chat_sessions;
delete from chat_read_states;
delete from anonymous_chat_contacts;
delete from anonymous_chat_sessions;
delete from chat_notification_batches;
delete from chat_threads;
set session_replication_role = 'origin';

-- 한 문의(스레드→AI세션→환자/봇/시스템/직원 메시지→티켓)를 한 번에 심는 세션-지역 헬퍼.
create or replace function pg_temp.make_ticket(
  p_patient uuid, p_reason text, p_status text, p_assignee uuid,
  p_appt uuid, p_question text, p_bot text, p_created timestamptz, p_staff_reply text
) returns void language plpgsql as $$
declare v_thread uuid; v_session uuid; v_ticket uuid;
begin
  insert into chat_threads (owner_type, patient_id, last_activity_at)
    values ('patient', p_patient, p_created) returning id into v_thread;
  insert into ai_chat_sessions (thread_id, expires_at, status)
    values (v_thread, p_created + interval '30 minutes', 'active') returning id into v_session;

  -- 환자 질문 → 봇 안내(상담 연결) → 세션 종료(핸드오프)
  insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_patient_id, message_type, content, created_at)
    values (v_thread, v_session, 'patient', p_patient, 'text', p_question, p_created);
  insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken, created_at)
    values (v_thread, v_session, 'bot', 'text', p_bot, 'handoff', p_created + interval '30 seconds');
  update ai_chat_sessions
     set status='ended', ended_at = p_created + interval '1 minute', end_reason='staff_handoff'
   where id = v_session;

  -- 티켓 — 상태별 배정·종료 필드(tickets_closed_fields: answered면 종료 주체·시각 둘 다).
  insert into support_tickets (
      thread_id, source_ai_session_id, appointment_id, status,
      assigned_staff_id, assigned_at, started_at, closed_by_staff_id, closed_at, created_at)
    values (
      v_thread, v_session, p_appt, p_status,
      case when p_status in ('in_progress','answered') then p_assignee end,
      case when p_status in ('in_progress','answered') then p_created + interval '2 minutes' end,
      case when p_status in ('in_progress','answered') then p_created + interval '2 minutes' end,
      case when p_status = 'answered' then p_assignee end,
      case when p_status = 'answered' then p_created + interval '20 minutes' end,
      p_created)
    returning id into v_ticket;

  -- 핸드오프 시스템 메시지(인계 사유 코드 — 목록의 인계 이유·요청 유형이 여기서 파생된다).
  insert into chat_messages (thread_id, support_ticket_id, sender_type, message_type, payload, created_at)
    values (v_thread, v_ticket, 'system', 'system',
      jsonb_build_object('event','staff_handoff','reason',p_reason), p_created + interval '1 minute');

  -- 직원 답변(처리 중·완료면 대화에 한 줄).
  if p_staff_reply is not null then
    insert into chat_messages (thread_id, support_ticket_id, sender_type, sender_staff_id, message_type, content, created_at)
      values (v_thread, v_ticket, 'staff', p_assignee, 'text', p_staff_reply, p_created + interval '3 minutes');
  end if;
end $$;

-- AI가 스스로 해결한 상담(티켓 없음) — 상담봇 기록(/chatlog) 전수 열람 대상.
-- 채널(app=로그인/web=익명)·갈래(route_taken)·답변 근거(chat_message_sources)를 담는다. 인계 없음.
create or replace function pg_temp.make_ai_resolved(
  p_patient uuid, p_channel text, p_route text,
  p_question text, p_bot text, p_src_title text, p_src_body text, p_created timestamptz
) returns void language plpgsql as $$
declare v_thread uuid; v_session uuid; v_anon uuid; v_bot uuid;
begin
  if p_channel = 'web' then
    insert into anonymous_chat_sessions (token_hash) values ('demo-' || gen_random_uuid()) returning id into v_anon;
    insert into chat_threads (owner_type, anonymous_session_id, last_activity_at)
      values ('anonymous_web', v_anon, p_created) returning id into v_thread;
  else
    insert into chat_threads (owner_type, patient_id, last_activity_at)
      values ('patient', p_patient, p_created) returning id into v_thread;
  end if;
  insert into ai_chat_sessions (thread_id, expires_at, status)
    values (v_thread, p_created + interval '30 minutes', 'active') returning id into v_session;

  if p_channel = 'web' then
    insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_anonymous_session_id, message_type, content, created_at)
      values (v_thread, v_session, 'patient', v_anon, 'text', p_question, p_created);
  else
    insert into chat_messages (thread_id, ai_chat_session_id, sender_type, sender_patient_id, message_type, content, created_at)
      values (v_thread, v_session, 'patient', p_patient, 'text', p_question, p_created);
  end if;
  insert into chat_messages (thread_id, ai_chat_session_id, sender_type, message_type, content, route_taken, created_at)
    values (v_thread, v_session, 'bot', 'text', p_bot, p_route, p_created + interval '20 seconds') returning id into v_bot;
  if p_src_title is not null then
    insert into chat_message_sources (message_id, rank, similarity, title_snapshot, body_snapshot)
      values (v_bot, 1, 0.86, p_src_title, p_src_body);
  end if;
end $$;

do $$
declare
  v_pids uuid[]; v_reception uuid; v_admin uuid; v_now timestamptz := now();
  v_appt_cancel uuid; v_appt_change uuid;
begin
  select array(select id from patients where is_active order by created_at limit 6) into v_pids;
  select id into v_reception from staff where role='receptionist' and is_active order by created_at limit 1;
  select id into v_admin     from staff where role='admin'        and is_active order by created_at limit 1;
  -- ⭐ SUPPORT-CAL-DUP-01 데모: 티켓을 「마감 후 상담 예약」(support_requested_at)에 연결해야 예약 캘린더
  --    패널이 상담 요약 + [상담 전체 보기]를 보인다. 취소 티켓→취소 예약, 변경 티켓→변경 예약으로 맞춘다.
  select id into v_appt_cancel from appointments where request_type='취소' and support_requested_at is not null order by created_at desc limit 1;
  select id into v_appt_change from appointments where request_type='변경' and support_requested_at is not null order by created_at desc limit 1;

  -- 새 문의(pending) — 취소 상담(예약 연결)
  perform pg_temp.make_ticket(v_pids[1], 'cancel_booking', 'pending', null, v_appt_cancel,
    '내일 예약을 취소하고 싶어요', '예약 취소는 직원 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '22 minutes', null);
  -- 새 문의(pending) — 의료 판단
  perform pg_temp.make_ticket(v_pids[2], 'medical_judgment', 'pending', null, null,
    '혈압약을 오늘 한 번 더 먹어도 되나요?', '추가 복용 전에 의료진 확인이 필요해 상담으로 연결할게요.',
    v_now - interval '8 minutes', null);
  -- 처리 중(in_progress) — 변경 상담(예약 연결·접수직원 담당)
  perform pg_temp.make_ticket(v_pids[3], 'change_booking', 'in_progress', v_reception, v_appt_change,
    '예약 시간을 오후로 바꿀 수 있나요?', '가능한 시간 확인을 위해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '50 minutes', '가능한 오후 시간을 확인하고 있습니다. 잠시만 기다려 주세요.');
  -- 답변 완료(answered) — 일반 문의(관리자 담당·종료)
  perform pg_temp.make_ticket(v_pids[4], 'no_answer', 'answered', v_admin, null,
    '주차 등록은 어디에서 하나요?', '안내 자료에서 찾지 못해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '1 day', '1층 원무 창구에서 진료 후 등록해 드립니다.');

  -- AI 해결(무티켓) — 채널·갈래·근거 섞어 상담봇 기록을 실데이터로 채운다.
  perform pg_temp.make_ai_resolved(v_pids[5], 'app', 'rag',
    '주차는 어디에 하나요?', '지하 2층 주차장을 이용하시면 됩니다. 진료 후 1층 창구에서 등록해 드려요.',
    '주차 안내', '지하 2층 · 진료 후 1층 원무과 등록', v_now - interval '2 hours');
  perform pg_temp.make_ai_resolved(v_pids[6], 'app', 'department_guide',
    '무릎이 아픈데 어디로 가야 하나요?', '무릎 통증은 정형외과 진료를 안내해 드릴게요.',
    null, null, v_now - interval '3 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'rag',
    '진료 시간이 어떻게 되나요?', '평일 09:00–18:00, 점심시간 13:00–14:00입니다.',
    '진료 시간 안내', '평일 09–18 · 점심 13–14', v_now - interval '90 minutes');
  perform pg_temp.make_ai_resolved(null, 'web', 'emergency',
    '가슴이 너무 아파요', '응급 증상일 수 있어요. 즉시 119에 전화하거나 가까운 응급실로 가세요.',
    null, null, v_now - interval '40 minutes');
end $$;

commit;
