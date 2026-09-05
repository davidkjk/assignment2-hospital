-- ============================================================================
-- seed_demo_chat.sql — 상담봇(4단계) 전 화면용 대규모 데모 데이터
-- ----------------------------------------------------------------------------
-- 메인 seed_demo.sql "뒤에" 별도 트랜잭션으로 돈다 — 실패해도 직원·예약 시드는 무사하다
-- (ON_ERROR_STOP로 전체가 롤백돼 로그인이 깨지는 사고를 막는다).
-- 환자·접수/관리자/의사·예약은 메인 시드에서 골라 참조한다.
--
-- 채우는 화면과 볼륨:
--   · 문의 티켓함(/tickets)·상세          — 티켓 24건(대기 8·처리중 8·완료 8), 사유·담당 다양
--   · 상담봇 기록(/chatlog)               — AI 자체해결 36건(앱/웹 × 긴급·자료안내·진료과안내·예약처리)
--                                           + 위 티켓 24건(직원연결 갈래) = 대화 60건
--   · 병원 안내자료(/bot/knowledge)        — KB 26건(10개 분류·승인/초안/보관·제한자료·수정본대기+이력)
--   · 오답 처리함(/bot/reports)            — answer_feedback 12건(신고·교정, 처리 전/적용/반려)
--   · 미해결·참고예시(/bot/unresolved)     — unresolved 20건(유사 묶음 5개+누락), 예시 12건
--   · 품질 검토(/bot/quality)             — chat_quality_reviews 8건(문제없음/교정)
--
-- 접수시각·생성시각을 몇 분~며칠로 벌려 접수순(created_at)·기간 필터가 눈에 보이게 한다.
-- 통계 대시보드(/bot/overview)는 501 스텁이라 데이터와 무관("현재 집계할 수 없음"은 정상).
-- ============================================================================

begin;

-- 재실행 안전: 챗봇 대화 데이터만 지운다. session↔ticket 순환 FK라 FK/트리거를 잠시 끈다
-- (핸드오프 정리 관례 · postgres 슈퍼유저에서만 가능). KB(kb_*)는 아래 별도 블록에서 지운다.
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
  v_pids uuid[]; v_docs uuid[]; v_reception uuid; v_admin uuid; v_now timestamptz := now();
  v_appt_cancel uuid; v_appt_change uuid; d1 uuid; d2 uuid; d3 uuid;
begin
  select array(select id from patients where is_active order by created_at limit 40) into v_pids;
  select array(select id from staff where role='doctor' and is_active order by created_at) into v_docs;
  select id into v_reception from staff where role='receptionist' and is_active order by created_at limit 1;
  select id into v_admin     from staff where role='admin'        and is_active order by created_at limit 1;
  d1 := v_docs[1]; d2 := v_docs[2]; d3 := v_docs[3];
  -- ⭐ SUPPORT-CAL-DUP-01 데모: 티켓을 「마감 후 상담 예약」(support_requested_at)에 연결해야 예약 캘린더
  --    패널이 상담 요약 + [상담 전체 보기]를 보인다. 취소 티켓→취소 예약, 변경 티켓→변경 예약으로 맞춘다.
  select id into v_appt_cancel from appointments where request_type='취소' and support_requested_at is not null order by created_at desc limit 1;
  select id into v_appt_change from appointments where request_type='변경' and support_requested_at is not null order by created_at desc limit 1;

  -- ══ 새 문의(pending) 8건 — 담당 없음. 접수시각을 촘촘히 벌려 접수순 큐가 보이게 ══
  perform pg_temp.make_ticket(v_pids[1], 'cancel_booking', 'pending', null, v_appt_cancel,
    '내일 오전 예약을 취소하고 싶어요', '예약 취소는 직원 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '4 minutes', null);
  perform pg_temp.make_ticket(v_pids[2], 'medical_judgment', 'pending', null, null,
    '혈압약을 오늘 한 번 더 먹어도 되나요?', '추가 복용 전에 의료진 확인이 필요해 상담으로 연결할게요.',
    v_now - interval '9 minutes', null);
  perform pg_temp.make_ticket(v_pids[3], 'no_answer', 'pending', null, null,
    '실손보험 청구에 필요한 서류가 뭔가요?', '보험 청구 서류는 안내 자료에서 찾지 못해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '16 minutes', null);
  perform pg_temp.make_ticket(v_pids[4], 'change_booking', 'pending', null, null,
    '예약을 다음 주로 미룰 수 있나요?', '원하는 시간 확인이 필요해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '23 minutes', null);
  perform pg_temp.make_ticket(v_pids[5], 'medical_judgment', 'pending', null, null,
    '상처 부위가 빨갛게 부었는데 병원에 가야 하나요?', '증상 판단은 의료진이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '34 minutes', null);
  perform pg_temp.make_ticket(v_pids[6], 'no_answer', 'pending', null, null,
    'MRI 촬영 비용이 얼마인가요?', '검사 비용은 안내 자료에서 확인되지 않아 직원 상담으로 연결해 드릴게요.',
    v_now - interval '47 minutes', null);
  perform pg_temp.make_ticket(v_pids[7], 'cancel_booking', 'pending', null, null,
    '오늘 소아과 예약을 취소해 주세요', '예약 취소는 직원 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '58 minutes', null);
  perform pg_temp.make_ticket(v_pids[8], 'medical_judgment', 'pending', null, null,
    '임신 중인데 감기약을 먹어도 되나요?', '복용 판단은 의료진 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '72 minutes', null);

  -- ══ 처리 중(in_progress) 8건 — 담당 배정 + 직원 답변 한 줄 ══
  perform pg_temp.make_ticket(v_pids[9], 'change_booking', 'in_progress', v_reception, v_appt_change,
    '예약 시간을 오후로 바꿀 수 있나요?', '가능한 시간 확인을 위해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '50 minutes', '가능한 오후 시간을 확인하고 있습니다. 잠시만 기다려 주세요.');
  perform pg_temp.make_ticket(v_pids[10], 'change_booking', 'in_progress', v_reception, null,
    '정형외과 예약 날짜를 변경할 수 있나요?', '원하는 날짜 확인을 위해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '80 minutes', '정형외과 담당 선생님 일정과 맞춰 확인 중입니다.');
  perform pg_temp.make_ticket(v_pids[11], 'medical_judgment', 'in_progress', d1, null,
    '무릎 수술 후 언제부터 걸어도 되나요?', '회복 경과는 담당 의료진 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '120 minutes', '수술 경과에 따라 다릅니다. 담당 선생님께 전달해 확인하겠습니다.');
  perform pg_temp.make_ticket(v_pids[12], 'medical_judgment', 'in_progress', d2, null,
    '당뇨 수치가 높게 나왔는데 어떻게 해야 하나요?', '수치 해석은 담당 의료진이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '3 hours', '검사 결과를 담당 선생님이 확인하고 있습니다. 조금만 기다려 주세요.');
  perform pg_temp.make_ticket(v_pids[13], 'no_answer', 'in_progress', v_admin, null,
    '진단서 발급에 며칠 걸리나요?', '발급 소요는 안내 자료에서 확인되지 않아 직원 상담으로 연결해 드릴게요.',
    v_now - interval '4 hours', '진단서는 보통 1~2일 걸립니다. 담당 부서에 확인 중입니다.');
  perform pg_temp.make_ticket(v_pids[14], 'cancel_booking', 'in_progress', v_reception, null,
    '예약을 취소하면 위약금이 있나요?', '취소 규정 확인을 위해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '5 hours', '취소 위약금은 없습니다. 취소 진행을 도와드리겠습니다.');
  perform pg_temp.make_ticket(v_pids[15], 'no_answer', 'in_progress', v_admin, null,
    '주차권은 어디서 받나요?', '안내 자료에서 찾지 못해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '6 hours', '1층 원무 창구에서 진료 후 등록해 드립니다. 확인해 드릴게요.');
  perform pg_temp.make_ticket(v_pids[16], 'medical_judgment', 'in_progress', d3, null,
    '복용 중인 약과 같이 먹으면 안 되는 음식이 있나요?', '약물 상호작용은 의료진 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '7 hours', '복용 약 목록을 담당 선생님께 전달해 확인 중입니다.');

  -- ══ 답변 완료(answered) 8건 — 담당 배정 + 답변 + 종료 ══
  perform pg_temp.make_ticket(v_pids[17], 'no_answer', 'answered', v_admin, null,
    '주차 등록은 어디에서 하나요?', '안내 자료에서 찾지 못해 직원 상담으로 연결해 드릴게요.',
    v_now - interval '1 day', '1층 원무 창구에서 진료 후 등록해 드립니다.');
  perform pg_temp.make_ticket(v_pids[18], 'no_answer', 'answered', v_admin, null,
    '증명서를 재발급 받을 수 있나요?', '재발급 절차는 안내 자료에서 확인되지 않아 직원 상담으로 연결해 드릴게요.',
    v_now - interval '1 day 3 hours', '네, 원무과에서 재발급 가능합니다. 신분증을 지참해 주세요.');
  perform pg_temp.make_ticket(v_pids[19], 'change_booking', 'answered', v_reception, null,
    '예약 확인 문자를 다시 받을 수 있나요?', '문자 재발송은 직원 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '1 day 6 hours', '예약 확인 문자를 다시 보내 드렸습니다.');
  perform pg_temp.make_ticket(v_pids[20], 'medical_judgment', 'answered', d1, null,
    '물리치료는 몇 번 받아야 하나요?', '치료 횟수는 담당 의료진 판단이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '2 days', '상태에 따라 다릅니다. 담당 선생님이 진료 때 안내드릴 예정입니다.');
  perform pg_temp.make_ticket(v_pids[21], 'cancel_booking', 'answered', v_reception, null,
    '가족 대신 예약을 취소해도 되나요?', '대리 취소는 직원 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '2 days 5 hours', '가족관계 확인 후 대리 취소를 도와드렸습니다.');
  perform pg_temp.make_ticket(v_pids[22], 'no_answer', 'answered', v_admin, null,
    '휠체어를 대여할 수 있나요?', '대여 안내는 자료에서 확인되지 않아 직원 상담으로 연결해 드릴게요.',
    v_now - interval '3 days', '1층 안내데스크에서 무료로 대여해 드립니다.');
  perform pg_temp.make_ticket(v_pids[23], 'no_answer', 'answered', v_admin, null,
    '모유수유실이 있나요?', '편의시설 안내는 자료에서 확인되지 않아 직원 상담으로 연결해 드릴게요.',
    v_now - interval '4 days', '3층에 수유실이 마련되어 있습니다.');
  perform pg_temp.make_ticket(v_pids[24], 'medical_judgment', 'answered', d2, null,
    '예방접종 후 열이 나는데 괜찮나요?', '접종 후 증상은 의료진 확인이 필요해 상담으로 연결해 드릴게요.',
    v_now - interval '5 days', '미열은 흔한 반응입니다. 고열이 지속되면 내원해 주세요. 담당 선생님 확인했습니다.');

  -- ══ AI 자체해결(무티켓) 36건 — 채널·갈래 섞어 상담봇 기록을 실데이터로 채운다 ══
  -- ── 자료안내(rag) 12건 · 근거 스냅샷 포함 ──
  perform pg_temp.make_ai_resolved(v_pids[25], 'app', 'rag',
    '주차는 어디에 하나요?', '지하 2층 주차장을 이용하시면 됩니다. 진료 후 1층 창구에서 2시간 무료 등록해 드려요.',
    '주차 안내', '지하 2층 · 진료 후 1층 원무과 등록(2시간 무료)', v_now - interval '2 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'rag',
    '진료 시간이 어떻게 되나요?', '평일 09:00–18:00, 점심시간 13:00–14:00입니다. 토요일은 오전만 진료합니다.',
    '진료 시간 안내', '평일 09–18 · 점심 13–14 · 토 오전', v_now - interval '90 minutes');
  perform pg_temp.make_ai_resolved(v_pids[26], 'app', 'rag',
    '위내시경 검사 전에 뭘 준비해야 하나요?', '검사 전날 밤 9시 이후 금식(물 포함)입니다. 혈압약은 당일 아침 소량의 물과 함께 드셔도 됩니다.',
    '위내시경 검사 전 준비', '전날 밤 9시 이후 금식 · 혈압약은 소량 물과 복용 가능', v_now - interval '5 hours');
  perform pg_temp.make_ai_resolved(v_pids[27], 'app', 'rag',
    '진료비는 어떻게 수납하나요?', '1층 원무 창구 또는 앱에서 수납할 수 있습니다.',
    '진료비 수납·서류 발급', '원무 창구 또는 앱 수납 · 서류는 원무과 신청', v_now - interval '7 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'rag',
    '예약 변경은 언제까지 되나요?', '진료 전날 18시까지 앱에서 직접 변경할 수 있고, 그 이후에는 상담(직원 확인)으로 연결됩니다.',
    '예약 변경·취소 규칙', '전날 18시까지 앱 · 이후 직원 확인', v_now - interval '9 hours');
  perform pg_temp.make_ai_resolved(v_pids[28], 'app', 'rag',
    '진단서는 어떻게 발급받나요?', '진료 후 원무과에 신청하시면 1~2일 안에 발급해 드립니다.',
    '진단서·소견서 발급 안내', '진료 후 원무과 신청 · 발급 1~2일', v_now - interval '11 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'rag',
    '휴일에도 진료하나요?', '일요일과 공휴일은 휴진이며, 토요일은 오전 진료만 운영합니다.',
    '야간·휴일 진료 안내', '일·공휴일 휴진 · 토 오전 진료', v_now - interval '13 hours');
  perform pg_temp.make_ai_resolved(v_pids[29], 'app', 'rag',
    '감염 예방을 위해 마스크를 써야 하나요?', '원내에서는 마스크 착용을 권장합니다. 발열·기침이 있으면 입구 선별 안내를 따라 주세요.',
    '감염 예방·마스크 안내', '원내 마스크 권장 · 발열 시 선별 안내', v_now - interval '1 day');
  perform pg_temp.make_ai_resolved(null, 'web', 'rag',
    '와이파이를 쓸 수 있나요?', '대기실에서 무료 와이파이를 이용하실 수 있습니다. 네트워크 이름은 GAON-GUEST입니다.',
    '편의시설 안내', '대기실 무료 와이파이(GAON-GUEST)', v_now - interval '1 day 4 hours');
  perform pg_temp.make_ai_resolved(v_pids[30], 'app', 'rag',
    '초진인데 접수는 어떻게 하나요?', '앱 예약 후 방문하시면 QR로 바로 접수됩니다. 처음이시면 1층 창구에서 등록을 도와드려요.',
    '초진·재진 접수 방법', '앱 예약 후 QR 접수 · 초진은 창구 등록', v_now - interval '1 day 8 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'rag',
    '대중교통으로 어떻게 가나요?', '지하철 3호선 가온역 2번 출구에서 도보 5분입니다. 버스는 101·203번을 이용하세요.',
    '오시는 길·대중교통', '3호선 가온역 2번 출구 도보 5분 · 버스 101·203', v_now - interval '2 days');
  perform pg_temp.make_ai_resolved(v_pids[31], 'app', 'rag',
    '건강검진 예약도 여기서 하나요?', '네, 건강검진 항목과 준비사항은 안내 자료를 참고하시고 예약은 원무과로 연결해 드립니다.',
    '건강검진 패키지 안내', '검진 항목·준비 안내 · 예약은 원무과', v_now - interval '2 days 6 hours');

  -- ── 진료과 안내(department_guide) 10건 · 근거 없음 ──
  perform pg_temp.make_ai_resolved(v_pids[32], 'app', 'department_guide',
    '무릎이 아픈데 어디로 가야 하나요?', '무릎 통증은 정형외과 진료를 안내해 드릴게요.', null, null, v_now - interval '3 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'department_guide',
    '귀에서 소리가 나요', '이명 증상은 이비인후과 진료를 안내해 드릴게요.', null, null, v_now - interval '6 hours');
  perform pg_temp.make_ai_resolved(v_pids[33], 'app', 'department_guide',
    '아이가 열이 나요', '소아 발열은 소아과 진료를 안내해 드릴게요.', null, null, v_now - interval '10 hours');
  perform pg_temp.make_ai_resolved(v_pids[34], 'app', 'department_guide',
    '소화가 안 되고 속이 쓰려요', '소화기 증상은 내과 진료를 안내해 드릴게요.', null, null, v_now - interval '14 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'department_guide',
    '허리가 아파요', '허리 통증은 정형외과 진료를 안내해 드릴게요.', null, null, v_now - interval '18 hours');
  perform pg_temp.make_ai_resolved(v_pids[35], 'app', 'department_guide',
    '목이 붓고 아파요', '인후 증상은 이비인후과 진료를 안내해 드릴게요.', null, null, v_now - interval '1 day 2 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'department_guide',
    '배가 자주 아파요', '복통은 내과 진료를 안내해 드릴게요.', null, null, v_now - interval '1 day 10 hours');
  perform pg_temp.make_ai_resolved(v_pids[36], 'app', 'department_guide',
    '코피가 자주 나요', '코피가 잦으면 이비인후과 진료를 안내해 드릴게요.', null, null, v_now - interval '2 days 3 hours');
  perform pg_temp.make_ai_resolved(v_pids[37], 'app', 'department_guide',
    '어깨가 안 올라가요', '어깨 통증·운동 제한은 정형외과 진료를 안내해 드릴게요.', null, null, v_now - interval '2 days 12 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'department_guide',
    '아이 예방접종은 어디서 하나요?', '영유아 예방접종은 소아과에서 진행합니다. 접종 일정을 안내해 드릴게요.', null, null, v_now - interval '3 days 2 hours');

  -- ── 예약 처리(agent) 8건 · 근거 없음 ──
  perform pg_temp.make_ai_resolved(v_pids[38], 'app', 'agent',
    '내 다음 예약이 언제인지 알려줘', '다음 예약은 이번 주 목요일 오전 10시 내과입니다.', null, null, v_now - interval '4 hours');
  perform pg_temp.make_ai_resolved(v_pids[39], 'app', 'agent',
    '가장 빠른 진료 시간이 언제예요?', '정형외과 기준 가장 빠른 예약은 내일 오전 9시 30분입니다. 예약을 도와드릴까요?', null, null, v_now - interval '8 hours');
  perform pg_temp.make_ai_resolved(v_pids[40], 'app', 'agent',
    '정형외과 예약 가능한 날 알려줘', '이번 주는 수·금 오후에 예약이 가능합니다. 원하는 시간을 골라 주세요.', null, null, v_now - interval '12 hours');
  perform pg_temp.make_ai_resolved(v_pids[1], 'app', 'agent',
    '예약을 확인해줘', '예약 내역을 보여드릴게요. 다음 예약은 금요일 오후 2시 이비인후과입니다.', null, null, v_now - interval '16 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'agent',
    '진료 예약을 하고 싶어요', '예약을 도와드릴게요. 원하는 진료과와 날짜를 알려 주세요.', null, null, v_now - interval '20 hours');
  perform pg_temp.make_ai_resolved(v_pids[2], 'app', 'agent',
    '이번 주 소아과 오전 예약 잡아줘', '이번 주 소아과 오전은 화·목이 가능합니다. 화요일 오전 10시로 안내해 드릴까요?', null, null, v_now - interval '1 day 5 hours');
  perform pg_temp.make_ai_resolved(v_pids[3], 'app', 'agent',
    '예약을 다음 진료로 바꿔줘', '예약 변경은 앱에서 바로 가능합니다. 원하는 시간을 선택하시면 도와드릴게요.', null, null, v_now - interval '2 days 8 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'agent',
    '오늘 진료 되는 과 있어요?', '오늘은 내과·이비인후과가 오후 예약 가능합니다. 원하시는 과를 알려 주세요.', null, null, v_now - interval '3 days 6 hours');

  -- ── 긴급(emergency) 6건 · 근거 없음 ──
  perform pg_temp.make_ai_resolved(null, 'web', 'emergency',
    '가슴이 너무 아파요', '응급 증상일 수 있어요. 즉시 119에 전화하거나 가까운 응급실로 가세요.', null, null, v_now - interval '40 minutes');
  perform pg_temp.make_ai_resolved(v_pids[4], 'app', 'emergency',
    '숨쉬기가 힘들어요', '호흡곤란은 응급 상황일 수 있어요. 지금 바로 119에 연락하거나 응급실로 가세요.', null, null, v_now - interval '3 hours');
  perform pg_temp.make_ai_resolved(null, 'web', 'emergency',
    '갑자기 한쪽 팔에 힘이 안 들어가요', '뇌졸중이 의심되는 증상이에요. 즉시 119에 전화하세요. 시간이 매우 중요합니다.', null, null, v_now - interval '9 hours');
  perform pg_temp.make_ai_resolved(v_pids[5], 'app', 'emergency',
    '아이가 경련을 해요', '소아 경련은 응급 상황입니다. 즉시 119에 연락하고 아이를 옆으로 눕혀 주세요.', null, null, v_now - interval '1 day 1 hour');
  perform pg_temp.make_ai_resolved(null, 'web', 'emergency',
    '약을 실수로 많이 먹었어요', '약물 과다복용이 의심됩니다. 지금 바로 119 또는 중독관리센터(1339)에 연락하세요.', null, null, v_now - interval '2 days 4 hours');
  perform pg_temp.make_ai_resolved(v_pids[6], 'app', 'emergency',
    '갑자기 심하게 어지럽고 말이 어눌해요', '응급 증상일 수 있어요. 즉시 119에 전화하거나 응급실로 가세요.', null, null, v_now - interval '3 days 9 hours');
end $$;

commit;

-- ============================================================================
-- 병원 안내자료(KB) 데모 — /bot/knowledge (상담봇 Task 20). 별도 트랜잭션.
-- 26건: 승인 다수(제한 3·수정본 대기+이력 2) · 초안 2 · 보관 2. 10개 분류에 걸친다.
-- 조각(kb_chunks)은 안 심는다(임베딩 필요 — 검색은 배포 시 재임베딩).
-- ============================================================================
begin;
do $$
declare
  v_admin uuid; v_doc uuid;
begin
  select id into v_admin from staff where role = 'admin' order by created_at limit 1;
  -- 재실행 안전: 데모 KB 전부 정리(조각·이력 먼저).
  delete from kb_document_revisions;
  delete from kb_chunks;
  delete from kb_documents;

  -- ── 위치·주차 ──
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('주차 안내', '위치·주차', E'지하 2층 주차장을 이용하세요.\n\n진료 후 1층 원무 창구에서 주차 등록을 해 드립니다(2시간 무료).',
          'approved', false, v_admin, v_admin, now() - interval '20 days', now() - interval '3 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('오시는 길·대중교통', '위치·주차', E'지하철 3호선 가온역 2번 출구에서 도보 5분입니다.\n\n버스는 101·203번을 이용하시고, 병원 앞 정류장에서 하차하세요.',
          'approved', false, v_admin, v_admin, now() - interval '25 days', now() - interval '25 days');

  -- ── 예약·변경·취소 규칙 (승인본 + 대기 수정본 + 이전 버전 이력) ──
  insert into kb_documents (title, category, content, status, is_restricted, has_pending_edit,
    pending_title, pending_category, pending_content, pending_is_restricted, pending_updated_by, pending_updated_at,
    created_by, approved_by, approved_at, updated_at)
  values ('예약 변경·취소 규칙', '예약·변경·취소 규칙',
          E'예약 변경·취소는 진료 전날 18시까지 앱에서 직접 할 수 있습니다.\n\n그 이후에는 상담(직원 확인)으로 연결됩니다.',
          'approved', false, true,
          '예약 변경·취소 규칙', '예약·변경·취소 규칙',
          E'예약 변경·취소는 진료 전날 18시까지 앱에서 직접 할 수 있습니다.\n\n당일 취소가 3회 누적되면 이후 예약은 직원 확인 후 확정됩니다.', false,
          v_admin, now() - interval '1 hour',
          v_admin, v_admin, now() - interval '10 days', now() - interval '1 hour')
  returning id into v_doc;
  insert into kb_document_revisions (document_id, previous_title, previous_category, previous_content, previous_is_restricted, changed_by, changed_at)
  values (v_doc, '예약 변경·취소 규칙', '예약·변경·취소 규칙', '예약 변경·취소는 진료 당일 오전까지 가능합니다.', false, v_admin, now() - interval '10 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('예약 노쇼(미방문) 안내', '예약·변경·취소 규칙',
          E'예약 후 연락 없이 방문하지 않으면 노쇼로 기록됩니다.\n\n노쇼가 반복되면 다음 예약은 직원 확인 후 확정될 수 있습니다.',
          'approved', false, v_admin, v_admin, now() - interval '12 days', now() - interval '12 days');

  -- ── 검사 전 준비사항 ──
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('위내시경 검사 전 준비', '검사 전 준비사항',
          E'검사 전날 밤 9시 이후 금식(물 포함)입니다.\n\n복용 중인 혈압약은 검사 당일 아침 소량의 물과 함께 드셔도 됩니다.',
          'approved', false, v_admin, v_admin, now() - interval '15 days', now() - interval '15 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('대장내시경 검사 전 준비', '검사 전 준비사항',
          E'검사 3일 전부터 씨앗·견과류·잡곡을 피하고, 전날 저녁부터 장정결제를 복용합니다.\n\n자세한 복용 시간은 예약 시 안내해 드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '14 days', now() - interval '14 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('복부 초음파 검사 전 준비', '검사 전 준비사항',
          E'검사 전 8시간 금식이 필요합니다(물은 소량 가능).\n\n오전 검사는 전날 밤 12시부터 금식하시면 됩니다.',
          'approved', false, v_admin, v_admin, now() - interval '13 days', now() - interval '13 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('공복 혈액검사 안내', '검사 전 준비사항',
          E'공복 혈액검사는 8~12시간 금식 후 진행합니다.\n\n물은 마셔도 되며, 복용 약이 있으면 예약 시 알려 주세요.',
          'approved', false, v_admin, v_admin, now() - interval '13 days', now() - interval '13 days');

  -- ── 진료비·증명서 (하나는 초안) ──
  insert into kb_documents (title, category, content, status, is_restricted, created_by, updated_at)
  values ('진료비 수납·서류 발급', '진료비·증명서',
          E'진료비는 1층 원무 창구 또는 앱에서 수납할 수 있습니다.\n\n진단서·소견서는 진료 후 원무과에 신청하세요(발급 1~2일).',
          'draft', false, v_admin, now() - interval '30 minutes');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('진단서·소견서 발급 안내', '진료비·증명서',
          E'진단서·소견서는 진료 후 원무과에 신청하시면 1~2일 안에 발급됩니다.\n\n본인이 아닌 경우 가족관계 서류와 신분증이 필요합니다.',
          'approved', false, v_admin, v_admin, now() - interval '9 days', now() - interval '9 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('실손보험 청구 서류 안내', '진료비·증명서',
          E'실손보험 청구에는 진료비 세부내역서와 진료비 영수증이 필요합니다.\n\n원무과에 요청하시면 발급해 드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '8 days', now() - interval '8 days');

  -- ── 진료과 안내 ──
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('내과 진료 안내', '진료과 안내',
          E'감기·소화기·고혈압·당뇨 등 내과 질환을 진료합니다.\n\n만성질환은 정기 진료로 관리해 드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '18 days', now() - interval '18 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('정형외과 진료 안내', '진료과 안내',
          E'관절·척추·근골격 통증과 외상, 재활을 진료합니다.\n\n물리치료가 필요한 경우 함께 안내해 드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '18 days', now() - interval '18 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('이비인후과 진료 안내', '진료과 안내',
          E'귀·코·목 질환과 어지럼, 이명을 진료합니다.\n\n알레르기 비염 관리도 도와드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '17 days', now() - interval '17 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('소아과 진료 안내', '진료과 안내',
          E'영유아·소아 질환과 발열, 예방접종을 진료합니다.\n\n접종 일정은 진료 시 함께 안내해 드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '17 days', now() - interval '17 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('예방접종 안내', '진료과 안내',
          E'독감·폐렴구균 등 성인 예방접종과 영유아 국가예방접종을 시행합니다.\n\n접종 가능 여부는 진료 후 안내해 드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '16 days', now() - interval '16 days');

  -- ── 감염관리·안전 (하나는 보관) ──
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('감염 예방·마스크 안내', '감염관리·안전',
          E'원내에서는 마스크 착용을 권장합니다.\n\n발열·기침 증상이 있으면 입구 선별 안내를 따라 주세요.',
          'approved', false, v_admin, v_admin, now() - interval '11 days', now() - interval '11 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('코로나19 선별진료 안내(종료)', '감염관리·안전', '코로나19 선별진료소는 2024년 6월까지 운영했습니다.',
          'archived', false, v_admin, v_admin, now() - interval '300 days', now() - interval '120 days');

  -- ── 편의시설 ──
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('편의시설(수유실·휠체어·와이파이) 안내', '편의시설',
          E'3층에 수유실이 있고, 1층 안내데스크에서 휠체어를 무료 대여합니다.\n\n대기실에서 무료 와이파이(GAON-GUEST)를 이용하실 수 있습니다.',
          'approved', false, v_admin, v_admin, now() - interval '10 days', now() - interval '10 days');

  -- ── 자주 묻는 질문 (제한 3 · 초안 1 · 보관 1 · 수정본 대기 1) ──
  -- 제한 자료: 봇이 직접 답하지 않고 이 문구만 그대로 보여준다(A3).
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('약 처방 관련 문의', '자주 묻는 질문',
          '처방·복용량 변경은 담당 의사 판단이 필요합니다. 직원 상담으로 연결해 드릴게요.',
          'approved', true, v_admin, v_admin, now() - interval '7 days', now() - interval '7 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('검사 결과 해석 문의', '자주 묻는 질문',
          '검사 결과 해석은 담당 의사 진료가 필요합니다. 진료 예약을 안내해 드릴게요.',
          'approved', true, v_admin, v_admin, now() - interval '6 days', now() - interval '6 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('증상 진단 문의', '자주 묻는 질문',
          '증상만으로는 진단이 어렵습니다. 정확한 진단을 위해 진료 예약을 안내해 드릴게요.',
          'approved', true, v_admin, v_admin, now() - interval '6 days', now() - interval '6 days');
  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('초진·재진 접수 방법', '자주 묻는 질문',
          E'앱에서 예약 후 방문하시면 QR로 바로 접수됩니다.\n\n처음 방문(초진)이시면 1층 창구에서 등록을 도와드립니다.',
          'approved', false, v_admin, v_admin, now() - interval '9 days', now() - interval '9 days');

  -- 처방전 재발급 — 승인본 + 대기 수정본 + 이력
  insert into kb_documents (title, category, content, status, is_restricted, has_pending_edit,
    pending_title, pending_category, pending_content, pending_is_restricted, pending_updated_by, pending_updated_at,
    created_by, approved_by, approved_at, updated_at)
  values ('처방전 재발급 안내', '자주 묻는 질문',
          E'처방전을 분실하셨다면 진료 후 원무과에서 재발급 받을 수 있습니다.\n\n재발급은 발급일로부터 유효기간 내에만 가능합니다.',
          'approved', false, true,
          '처방전 재발급 안내', '자주 묻는 질문',
          E'처방전을 분실하셨다면 진료 후 원무과에서 재발급 받을 수 있습니다.\n\n재발급 시 본인 확인을 위해 신분증이 필요합니다.', false,
          v_admin, now() - interval '2 hours',
          v_admin, v_admin, now() - interval '8 days', now() - interval '2 hours')
  returning id into v_doc;
  insert into kb_document_revisions (document_id, previous_title, previous_category, previous_content, previous_is_restricted, changed_by, changed_at)
  values (v_doc, '처방전 재발급 안내', '자주 묻는 질문', '처방전 재발급은 원무과에서 가능합니다.', false, v_admin, now() - interval '8 days');

  insert into kb_documents (title, category, content, status, is_restricted, created_by, updated_at)
  values ('건강검진 패키지 안내', '자주 묻는 질문',
          E'기본·정밀 건강검진 패키지를 운영합니다.\n\n항목과 비용은 원무과에 문의해 주세요. (내용 확정 전 초안)',
          'draft', false, v_admin, now() - interval '45 minutes');

  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('휴일 진료 문의(옛 안내)', '자주 묻는 질문', '토요일 오전 진료는 2025년 12월까지 운영했습니다.',
          'archived', false, v_admin, v_admin, now() - interval '200 days', now() - interval '40 days');

  insert into kb_documents (title, category, content, status, is_restricted, created_by, approved_by, approved_at, updated_at)
  values ('야간·휴일 진료 안내', '자주 묻는 질문',
          E'평일 야간 진료는 운영하지 않습니다.\n\n일요일·공휴일은 휴진이며 응급 상황은 119 또는 가까운 응급실을 이용해 주세요.',
          'approved', false, v_admin, v_admin, now() - interval '5 days', now() - interval '5 days');
end $$;
commit;

-- ============================================================================
-- 품질·미해결·오답 처리함·참고 예시 데모 — /bot/{reports,quality,unresolved} (상담봇 Task 21). 별도 트랜잭션.
-- 봇 메시지·티켓·세션은 위 블록이 심은 것을 골라 참조한다. 임베딩은 합성(단위벡터=같은 묶음, 영벡터=누락 gap).
-- ============================================================================
begin;
create function pg_temp.unit_vec(i int) returns vector language sql as $$
  select ('[' || string_agg(case when g = i then '1' else '0' end, ',' order by g) || ']')::vector from generate_series(1, 1536) g $$;
create function pg_temp.zero_vec() returns vector language sql as $$
  select ('[' || string_agg('0', ',') || ']')::vector from generate_series(1, 1536) g $$;
do $$
declare
  v_admin uuid; v_bots uuid[]; v_tks uuid[]; v_sess uuid[]; v_fb1 uuid; v_fb2 uuid; v_fb3 uuid;
begin
  select id into v_admin from staff where role = 'admin' order by created_at limit 1;
  -- 재실행 안전: 챗봇 품질 데이터만 비운다(KB는 건드리지 않음).
  delete from qa_example_bank; delete from answer_feedback; delete from unresolved_questions; delete from chat_quality_reviews;

  -- 참조 풀: 봇 메시지·티켓·세션을 배열로 담아 여러 건이 서로 다른 대상을 가리키게 한다.
  select array(select id from chat_messages where sender_type = 'bot' order by created_at desc) into v_bots;
  select array(select id from support_tickets order by created_at asc) into v_tks;
  select array(select id from ai_chat_sessions order by created_at asc) into v_sess;

  -- ══ 오답 처리함(answer_feedback) 12건 — 신고(source)·상태 섞기 ══
  -- 처리 전(pending) 6건: 실시간 신고 4(교정문 있음/없음) + 정기검토 교정 2
  insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank, created_at) values
    (v_bots[1],  v_admin, 'realtime_report', '주차는 지하 2층이고, 진료 후 1층 원무 창구에서 2시간 무료 등록이 됩니다.', true,  now() - interval '3 hours'),
    (v_bots[2],  v_admin, 'realtime_report', null,                                                                    false, now() - interval '8 hours'),
    (v_bots[3],  v_admin, 'quality_review',  '평일 09:00–18:00 진료이며 점심시간(13–14시)에는 접수만 받습니다.',        false, now() - interval '1 day'),
    (v_bots[4],  v_admin, 'realtime_report', '진단서는 진료 후 원무과 신청 시 보통 1~2일 안에 발급됩니다.',              true,  now() - interval '1 day 4 hours'),
    (v_bots[5],  v_admin, 'realtime_report', null,                                                                    false, now() - interval '2 days'),
    (v_bots[6],  v_admin, 'quality_review',  '실손보험 청구에는 진료비 세부내역서와 영수증이 필요합니다.',                true,  now() - interval '2 days 6 hours');

  -- 적용 완료(applied) 3건: 예시은행에 반영됨 → 아래 qa_example_bank가 참조
  insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank, status, resolved_by, resolved_at, created_at)
    values (v_bots[7], v_admin, 'realtime_report', '접수는 1층 원무 창구 또는 앱 QR로 할 수 있습니다.', true, 'applied', v_admin, now() - interval '4 days', now() - interval '5 days')
    returning id into v_fb1;
  insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank, status, resolved_by, resolved_at, created_at)
    values (v_bots[8], v_admin, 'quality_review', '진단서는 진료 후 원무과에 신청하면 1~2일 안에 발급됩니다.', true, 'applied', v_admin, now() - interval '6 days', now() - interval '7 days')
    returning id into v_fb2;
  insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank, status, resolved_by, resolved_at, created_at)
    values (v_bots[9], v_admin, 'realtime_report', '와이파이는 대기실에서 GAON-GUEST로 무료 이용할 수 있습니다.', true, 'applied', v_admin, now() - interval '8 days', now() - interval '9 days')
    returning id into v_fb3;

  -- 반려(rejected) 3건: 신고했으나 교정 불필요로 종결
  insert into answer_feedback (message_id, reported_by, source, correction_text, add_to_example_bank, status, resolved_by, resolved_at, created_at) values
    (v_bots[10], v_admin, 'realtime_report', null, false, 'rejected', v_admin, now() - interval '3 days', now() - interval '4 days'),
    (v_bots[11], v_admin, 'quality_review',  null, false, 'rejected', v_admin, now() - interval '5 days', now() - interval '6 days'),
    (v_bots[12], v_admin, 'realtime_report', null, false, 'rejected', v_admin, now() - interval '9 days', now() - interval '10 days');

  -- ══ 참고 예시(qa_example_bank) 12건 — 승인된 교정 + 상시 예시 ══
  insert into qa_example_bank (question, answer, embedding, source_feedback_id, is_active, created_at) values
    ('접수는 어디서 하나요?',       '1층 원무 창구 또는 앱 QR로 접수할 수 있습니다.',                pg_temp.zero_vec(), v_fb1, true,  now() - interval '4 days'),
    ('진단서는 어떻게 받나요?',     '진료 후 원무과에 신청하면 1~2일 안에 발급됩니다.',              pg_temp.zero_vec(), v_fb2, true,  now() - interval '6 days'),
    ('와이파이 쓸 수 있어요?',      '대기실에서 GAON-GUEST로 무료 와이파이를 이용할 수 있습니다.',   pg_temp.zero_vec(), v_fb3, true,  now() - interval '8 days'),
    ('주차 무료인가요?',           '진료 후 1층 원무 창구에서 등록하면 2시간 무료입니다.',          pg_temp.zero_vec(), null,  true,  now() - interval '3 days'),
    ('점심시간에도 접수되나요?',    '점심시간(13–14시)에는 접수만 받고 진료는 이후 재개합니다.',     pg_temp.zero_vec(), null,  true,  now() - interval '5 days'),
    ('예약 변경은 언제까지 돼요?',  '진료 전날 18시까지 앱에서 직접 변경할 수 있습니다.',            pg_temp.zero_vec(), null,  true,  now() - interval '7 days'),
    ('실손보험 서류 뭐가 필요해요?','진료비 세부내역서와 영수증이 필요하며 원무과에서 발급합니다.',   pg_temp.zero_vec(), null,  true,  now() - interval '9 days'),
    ('휠체어 빌릴 수 있나요?',      '1층 안내데스크에서 무료로 대여해 드립니다.',                    pg_temp.zero_vec(), null,  true,  now() - interval '10 days'),
    ('수유실 있어요?',             '3층에 수유실이 마련되어 있습니다.',                             pg_temp.zero_vec(), null,  true,  now() - interval '11 days'),
    ('오시는 길 알려주세요',        '지하철 3호선 가온역 2번 출구에서 도보 5분입니다.',              pg_temp.zero_vec(), null,  true,  now() - interval '12 days'),
    ('초진도 앱으로 접수돼요?',     '초진은 1층 창구 등록 후 이용하시고, 재진부터 QR 접수됩니다.',    pg_temp.zero_vec(), null,  true,  now() - interval '13 days'),
    ('토요일 진료하나요?',          '토요일은 오전만 진료하며 일요일·공휴일은 휴진입니다.',           pg_temp.zero_vec(), null,  false, now() - interval '14 days');

  -- ══ 미해결 질문(unresolved_questions) 20건 — 유사 묶음 5개 + 임베딩 누락 3건 ══
  -- unit_vec(k)가 같으면 같은 클러스터로 묶인다. zero_vec는 집계 누락(embedding_gap)으로 별도 안내.
  insert into unresolved_questions (ticket_id, question_text, question_embedding, created_at) values
    -- 묶음 1: 주차 (4)
    (v_tks[1], '주차는 어디에 하나요',            pg_temp.unit_vec(1), now() - interval '5 days'),
    (v_tks[2], '주차장 위치가 어디예요',          pg_temp.unit_vec(1), now() - interval '4 days'),
    (v_tks[3], '주차 되나요?',                   pg_temp.unit_vec(1), now() - interval '2 days'),
    (v_tks[4], '주차 요금 있나요',               pg_temp.unit_vec(1), now() - interval '1 day'),
    -- 묶음 2: 주말·휴일 진료 (4)
    (v_tks[5], '주말에도 진료하나요',            pg_temp.unit_vec(2), now() - interval '3 days'),
    (v_tks[6], '토요일 진료 시간 알려주세요',     pg_temp.unit_vec(2), now() - interval '2 days'),
    (v_tks[7], '일요일에 문 여나요',             pg_temp.unit_vec(2), now() - interval '1 day'),
    (v_tks[8], '공휴일 진료 되나요',             pg_temp.unit_vec(2), now() - interval '12 hours'),
    -- 묶음 3: 증명서·서류 비용 (4)
    (v_tks[9],  '진단서 비용이 얼마예요',         pg_temp.unit_vec(3), now() - interval '4 days'),
    (v_tks[10], '소견서 발급 비용 알려주세요',    pg_temp.unit_vec(3), now() - interval '3 days'),
    (v_tks[11], '서류 발급에 돈이 드나요',        pg_temp.unit_vec(3), now() - interval '2 days'),
    (v_tks[12], '증명서 재발급 비용 있어요',      pg_temp.unit_vec(3), now() - interval '1 day'),
    -- 묶음 4: 보험 청구 (3)
    (v_tks[13], '실손보험 청구 어떻게 해요',      pg_temp.unit_vec(4), now() - interval '3 days'),
    (v_tks[14], '보험 서류 뭐 필요해요',          pg_temp.unit_vec(4), now() - interval '2 days'),
    (v_tks[15], '보험사에 제출할 서류 주세요',    pg_temp.unit_vec(4), now() - interval '1 day'),
    -- 묶음 5: 검사 비용 (3)
    (v_tks[16], 'MRI 비용이 얼마인가요',          pg_temp.unit_vec(5), now() - interval '2 days'),
    (v_tks[17], '위내시경 검사비 알려주세요',     pg_temp.unit_vec(5), now() - interval '1 day'),
    (v_tks[18], 'CT 촬영 비용 있나요',           pg_temp.unit_vec(5), now() - interval '8 hours'),
    -- 임베딩 누락(집계에서 빠지는 안내) 2건
    (v_tks[19], '건강검진 항목이 궁금해요',       pg_temp.zero_vec(),  now() - interval '6 hours'),
    (v_tks[20], '예방접종 종류 알려주세요',       pg_temp.zero_vec(),  now() - interval '3 hours');

  -- ══ 품질 검토(chat_quality_reviews) 8건 — 문제없음(ok)/교정(corrected) 섞기(세션 단위 unique) ══
  insert into chat_quality_reviews (ai_chat_session_id, status, reviewed_by) values
    (v_sess[1], 'ok',        v_admin),
    (v_sess[2], 'ok',        v_admin),
    (v_sess[3], 'corrected', v_admin),
    (v_sess[4], 'ok',        v_admin),
    (v_sess[5], 'corrected', v_admin),
    (v_sess[6], 'ok',        v_admin),
    (v_sess[7], 'ok',        v_admin),
    (v_sess[8], 'corrected', v_admin);
end $$;
commit;
