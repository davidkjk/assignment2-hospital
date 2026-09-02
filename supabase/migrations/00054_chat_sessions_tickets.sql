-- 3-A 통합 대화 스키마 ② AI 상담 단위 + 직원 티켓 생명주기 + 원자 배정 (§4.2·§4.4·§8).
-- Task 1 chat_messages의 앞선 FK(세션·티켓)를 채우고, 세션/티켓↔메시지 상담방 일치 트리거를 얹는다.
-- 번호: Task 1이 00053(chat_core_schema)을 썼으므로 챗봇 대역 다음 번호 00054(00053~00069 비어 있음).

-- ── ai_chat_sessions: 30분 경계를 가진 AI 상담 단위 (§4.4) ──
create table ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  status text not null default 'active' check (status in ('active', 'expired', 'ended')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- last_activity_at + 30분. 만료 후보 조회용(§4.4)
  ended_at timestamptz,
  end_reason text check (end_reason in ('inactivity_timeout', 'staff_handoff', 'new_question')),
  closing_summary text,
  summary_last_message_id uuid references chat_messages(id),
  summary_created_at timestamptz,
  continuation_source_type text check (continuation_source_type in ('ai_session', 'support_ticket')),
  continued_from_ai_session_id uuid references ai_chat_sessions(id),
  continued_from_ticket_id uuid,            -- FK support_tickets — 아래에서 표 생성 후 alter
  continuation_summary text,
  created_at timestamptz not null default now(),
  -- 상태 ↔ 종료 사유 정합 (§4.4)
  constraint ai_sessions_status_reason check (
    case status
      when 'active'  then ended_at is null and end_reason is null
      when 'expired' then end_reason = 'inactivity_timeout'
      when 'ended'   then end_reason in ('staff_handoff', 'new_question')
    end
  ),
  -- 이어가기 출처 XOR + continuation_source_type 일치 (§4.4)
  constraint ai_sessions_continuation_consistent check (
    (continuation_source_type is null
       and continued_from_ai_session_id is null and continued_from_ticket_id is null)
    or (continuation_source_type = 'ai_session'
       and continued_from_ai_session_id is not null and continued_from_ticket_id is null)
    or (continuation_source_type = 'support_ticket'
       and continued_from_ticket_id is not null and continued_from_ai_session_id is null)
  )
);
create unique index idx_ai_sessions_one_active on ai_chat_sessions (thread_id) where status = 'active';  -- thread당 active 하나(§4.4·§6)
create index idx_ai_sessions_expiry on ai_chat_sessions (expires_at) where status = 'active';            -- 만료 배치(§6)

-- ── support_tickets: 직원 상담 생명주기 (§4.2) + 예약 연결(공백 3) ──
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  source_ai_session_id uuid references ai_chat_sessions(id),
  previous_ticket_id uuid references support_tickets(id),  -- 재문의가 직전 answered 티켓을 가리킴(재개 아님)
  appointment_id uuid references appointments(id),         -- 공백3: 취소·변경 상담이 어느 예약인지 DB가 보장(nullable — 일반 문의는 없음)
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'answered')),
  assigned_staff_id uuid references staff(id),
  assigned_at timestamptz,
  started_at timestamptz,
  closed_by_staff_id uuid references staff(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- answered면 종료 주체·시각 둘 다, 그 외엔 둘 다 null (§4.2)
  constraint tickets_closed_fields check (
    (status = 'answered' and closed_by_staff_id is not null and closed_at is not null)
    or (status <> 'answered' and closed_by_staff_id is null and closed_at is null)
  )
);
-- thread당 열린 티켓(pending|in_progress) 최대 하나(§4.2·§6). 재문의는 새 PK. ⭐ SUPPORT-CAL-DUP 계열 대표 티켓의 근거(완전 ID=Task 18).
create unique index idx_tickets_one_open on support_tickets (thread_id) where status in ('pending', 'in_progress');
create index idx_tickets_queue on support_tickets (status, created_at) where status in ('pending', 'in_progress');  -- 직원 큐(접수순)
create index idx_tickets_assigned on support_tickets (assigned_staff_id, status, updated_at);
create index idx_tickets_thread on support_tickets (thread_id, created_at);
create index idx_tickets_appointment on support_tickets (appointment_id) where appointment_id is not null;

alter table ai_chat_sessions
  add constraint ai_sessions_continued_ticket_fk
  foreign key (continued_from_ticket_id) references support_tickets(id);

-- 배정·이관 감사 이력 (§4.2). support_tickets.assigned_staff_id가 현재값, 이 표가 변경 이력.
create table support_ticket_assignment_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id),
  from_staff_id uuid references staff(id),        -- 최초 배정이면 null
  to_staff_id uuid not null references staff(id),
  changed_by_staff_id uuid not null references staff(id),
  changed_at timestamptz not null default now()
);
create index idx_ticket_assignment_ticket on support_ticket_assignment_history (ticket_id, changed_at);

-- ── Task 1 chat_messages 앞선 FK를 채운다 (설계결정 3) ──
alter table chat_messages
  add constraint chat_messages_ai_session_fk foreign key (ai_chat_session_id) references ai_chat_sessions(id),
  add constraint chat_messages_ticket_fk     foreign key (support_ticket_id)  references support_tickets(id);

-- 세션/티켓의 thread_id는 메시지 thread_id와 같아야 한다 (§4.3, Task 1에서 이월).
create or replace function validate_chat_message_session_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_thread uuid;
begin
  if new.ai_chat_session_id is not null then
    select thread_id into v_thread from public.ai_chat_sessions where id = new.ai_chat_session_id;
    if v_thread is distinct from new.thread_id then
      raise exception 'AI 세션의 상담방이 메시지 상담방과 다릅니다.' using errcode = 'P0001';
    end if;
  end if;
  if new.support_ticket_id is not null then
    select thread_id into v_thread from public.support_tickets where id = new.support_ticket_id;
    if v_thread is distinct from new.thread_id then
      raise exception '티켓의 상담방이 메시지 상담방과 다릅니다.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_validate_chat_message_session_thread
  before insert on chat_messages for each row execute function validate_chat_message_session_thread();

-- ══ 원자 primitive (security definer) ══

-- 원자 배정(§8-1, Global Constraint): 티켓 상세 열기가 pending 티켓을 자동 배정. 경쟁 패자는 raise.
create or replace function claim_ticket(p_ticket_id uuid)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_prev uuid; v_row public.support_tickets; v_cur public.support_tickets;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 상담을 맡을 수 있습니다.' using errcode = 'P0001'; end if;
  select assigned_staff_id into v_prev from public.support_tickets where id = p_ticket_id for update;
  update public.support_tickets
     set assigned_staff_id = v_staff, status = 'in_progress',
         assigned_at = now(), started_at = coalesce(started_at, now()), updated_at = now()
   where id = p_ticket_id and status = 'pending'
   returning * into v_row;
  if found then
    insert into public.support_ticket_assignment_history (ticket_id, from_staff_id, to_staff_id, changed_by_staff_id)
    values (p_ticket_id, v_prev, v_staff, v_staff);
    return v_row;
  end if;
  -- pending이 아니었다. 내가 이미 맡은 것을 다시 연 것이면 재배정 없이 그대로 반환.
  select * into v_cur from public.support_tickets where id = p_ticket_id;
  if v_cur.status = 'in_progress' and v_cur.assigned_staff_id = v_staff then
    return v_cur;
  end if;
  raise exception '이미 다른 직원이 맡았어요.' using errcode = 'P0001';  -- 경쟁 패자
end;
$$;

-- 별도 [상담 종료]만 answered. 일반 [보내기]는 이걸 부르지 않는다(§8-2). in_progress만 종료 가능.
create or replace function close_ticket(p_ticket_id uuid)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_row public.support_tickets;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 상담을 종료할 수 있습니다.' using errcode = 'P0001'; end if;
  update public.support_tickets
     set status = 'answered', closed_by_staff_id = v_staff, closed_at = now(), updated_at = now()
   where id = p_ticket_id and status = 'in_progress'
   returning * into v_row;
  if not found then raise exception '진행 중인 상담만 종료할 수 있습니다.' using errcode = 'P0001'; end if;
  return v_row;  -- ⭐ TICKET-DETAIL-NOTIFY 계열: 답변 알림이 키로 삼는 answered를 여기서 찍는다(발송은 Task 3, 완전 ID=Task 17).
end;
$$;

-- 직원 답변 전송(§8-2·§8-4): status 불변. 종료 티켓엔 금지. client_message_id 재전송은 멱등.
create or replace function staff_send_ticket_message(p_ticket_id uuid, p_content text, p_client_message_id uuid default null)
returns chat_messages language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_thread uuid; v_status text; v_row public.chat_messages;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 답변할 수 있습니다.' using errcode = 'P0001'; end if;
  select thread_id, status into v_thread, v_status from public.support_tickets where id = p_ticket_id;
  if v_thread is null then raise exception '없는 상담입니다.' using errcode = 'P0001'; end if;
  if v_status = 'answered' then
    raise exception '종료된 상담에는 메시지를 보낼 수 없습니다. 재문의는 새 상담으로 만드세요.' using errcode = 'P0001';
  end if;
  insert into public.chat_messages
    (thread_id, support_ticket_id, sender_type, sender_staff_id, message_type, content, client_message_id)
  values (v_thread, p_ticket_id, 'staff', v_staff, 'text', p_content, p_client_message_id)
  on conflict (client_message_id) where client_message_id is not null do nothing
  returning * into v_row;
  if v_row.id is null and p_client_message_id is not null then          -- 재전송 멱등: 기존 행 반환
    select * into v_row from public.chat_messages where client_message_id = p_client_message_id;
  end if;
  update public.chat_threads set last_activity_at = now(), updated_at = now() where id = v_thread;
  return v_row;
end;
$$;

-- 재문의(§8-3): 직전 answered 티켓을 가리키는 새 티켓. 열린 티켓이 있으면 partial unique가 막는다.
create or replace function create_support_ticket(
  p_thread_id uuid, p_source_ai_session_id uuid default null,
  p_appointment_id uuid default null, p_previous_ticket_id uuid default null)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_row public.support_tickets; v_prev public.support_tickets;
begin
  if p_previous_ticket_id is not null then
    select * into v_prev from public.support_tickets where id = p_previous_ticket_id;
    if v_prev.thread_id is distinct from p_thread_id then
      raise exception '재문의는 같은 상담방에서만 만들 수 있습니다.' using errcode = 'P0001';
    end if;
    if v_prev.status <> 'answered' then
      raise exception '이전 상담이 종료된 뒤에만 재문의할 수 있습니다.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.support_tickets (thread_id, source_ai_session_id, appointment_id, previous_ticket_id)
  values (p_thread_id, p_source_ai_session_id, p_appointment_id, p_previous_ticket_id)
  returning * into v_row;
  return v_row;
exception when unique_violation then                                     -- 이미 열린 티켓이 있다
  raise exception '이미 직원 확인을 기다리는 상담이 있어요.' using errcode = 'P0001';
end;
$$;

-- 새 AI 상담 단위(§4.4). [이전 내용 이어서]=출처 채움, [새 질문 시작]=출처 null.
create or replace function create_ai_session(
  p_thread_id uuid, p_continuation_source_type text default null,
  p_continued_from_ai_session_id uuid default null, p_continued_from_ticket_id uuid default null,
  p_continuation_summary text default null)
returns ai_chat_sessions language plpgsql security definer set search_path = '' as $$
declare v_row public.ai_chat_sessions;
begin
  insert into public.ai_chat_sessions
    (thread_id, expires_at, continuation_source_type,
     continued_from_ai_session_id, continued_from_ticket_id, continuation_summary)
  values (p_thread_id, now() + interval '30 minutes', p_continuation_source_type,
          p_continued_from_ai_session_id, p_continued_from_ticket_id, p_continuation_summary)
  returning * into v_row;
  return v_row;
exception when unique_violation then                                     -- thread당 active 하나
  raise exception '이미 진행 중인 AI 상담이 있어요.' using errcode = 'P0001';
end;
$$;

-- 30분 연장(§4.4·§8-5): active면서 아직 만료 경계 전(now < expires_at)만. 아니면 raise → 만료 배치와 상호배제.
-- C6-#8 F03(2026-08-20): status='active'만 걸면 지연 배치 전 30분 초과 세션에 새 메시지가 와도 다시 30분 연장돼
--   만료 경계를 넘긴 세션이 되살아난다 → `now() < expires_at`를 함께 걸어 경계에서 만료/수락 중 하나만 이기게 한다.
create or replace function record_ai_activity(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.ai_chat_sessions
     set last_activity_at = now(), expires_at = now() + interval '30 minutes'
   where id = p_session_id and status = 'active' and now() < expires_at;
  if not found then raise exception '만료되었거나 종료된 AI 상담입니다.' using errcode = 'P0001'; end if;
end;
$$;

-- 만료 배치(§8-5): now >= expires_at인 active만 조건부로 expired. 새 메시지의 record_ai_activity와 경쟁해도 하나만 이긴다.
create or replace function expire_idle_ai_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  with expired as (
    update public.ai_chat_sessions
       set status = 'expired', ended_at = now(), end_reason = 'inactivity_timeout'
     where status = 'active' and now() >= expires_at
     returning id)
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- ── RLS (§7) ──
-- 교차 테이블 RLS 재귀 차단(프로젝트 관용구 = private.* security definer, 00017 patient_owns와 동형):
-- support_tickets 환자 정책이 chat_threads를 읽고, 직원의 chat_threads/chat_messages 정책이 다시
-- support_tickets를 읽으면 Postgres가 「infinite recursion in policy」로 막는다. 직원 정책의 티켓 존재
-- 검사를 definer 함수로 감싸(소유자 postgres = RLS 우회) support_tickets↔chat_threads 사이클을 끊는다.
create or replace function private.thread_has_ticket(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.support_tickets where thread_id = p_thread_id)
$$;

alter table ai_chat_sessions enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_assignment_history enable row level security;
grant select on table ai_chat_sessions to authenticated;
grant select on table support_tickets to authenticated;
grant select on table support_ticket_assignment_history to authenticated;

-- 환자는 자기 상담방의 세션·티켓을 읽는다.
create policy "patients_read_own_ai_sessions" on ai_chat_sessions
  for select using (exists (select 1 from chat_threads t
    where t.id = ai_chat_sessions.thread_id and t.owner_type = 'patient' and patient_owns(t.patient_id)));
create policy "patients_read_own_tickets" on support_tickets
  for select using (exists (select 1 from chat_threads t
    where t.id = support_tickets.thread_id and t.owner_type = 'patient' and patient_owns(t.patient_id)));

-- 직원(활성)은 티켓·세션·이력을 읽는다. 정확한 역할 범위(의사/접수/관리자)는 동작명세 권한 계약(Task 16~19)이 좁힌다(§7).
create policy "staff_read_tickets" on support_tickets for select using (private.is_active_staff());
create policy "staff_read_ticket_ai_sessions" on ai_chat_sessions for select using (private.is_active_staff());
create policy "staff_read_assignment_history" on support_ticket_assignment_history for select using (private.is_active_staff());

-- Task 1에서 이월된 직원 상담방·메시지 읽기: 티켓이 걸린 상담방(직원이 볼 수 있는 것).
-- 티켓 존재 검사는 definer 함수로(위 재귀 차단 주석 참조).
create policy "staff_read_thread_of_tickets" on chat_threads for select using (
  private.is_active_staff() and private.thread_has_ticket(chat_threads.id));
create policy "staff_read_messages_of_tickets" on chat_messages for select using (
  private.is_active_staff() and private.thread_has_ticket(chat_messages.thread_id));
