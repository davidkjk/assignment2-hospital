-- 3-A 통합 대화 스키마 ① 대화 루트 + 단일 메시지 원장 + 읽음 상태 (공백 1·2·6).
-- 근거: 3A 스키마 요구 §4.1·§4.3·§4.6·§6·§7 (결정로그 ui-design-decisions:4371-4465에 병합).
--       enum은 관례대로 text+check(3A §3 허용), 허용값은 3A §3 영문.
-- ⚠️ 챗봇 대역 00053(00052 뒤, 00070 앞). 환자앱·직원웹과 같은 대역 공유(Global Constraints).
-- ⚠️ 앞선 FK: ai_chat_sessions·support_tickets(Task 2)·anonymous_chat_sessions(Task 3)는 아직 없다.
--    그 대상 칼럼은 여기서 uuid로만 만들고 FK 제약은 대상 표를 만드는 Task 2·3이 alter로 건다.

-- ── chat_threads: 환자에게 보이는 "같은 상담방"의 안정적 루트 (§4.1) ──
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('patient', 'anonymous_web')),
  patient_id uuid references patients(id),              -- owner_type=patient일 때만
  anonymous_session_id uuid,                            -- FK는 Task 3(anonymous_chat_sessions)
  last_activity_at timestamptz not null default now(),  -- 목록 정렬용 전체 마지막 활동. AI 30분 만료 판단엔 쓰지 않음(§4.1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 소유권 XOR: patient면 patient_id만, anonymous_web이면 anonymous_session_id만 (§4.1)
  constraint chat_threads_owner_xor check (
    (owner_type = 'patient'       and patient_id is not null and anonymous_session_id is null)
    or (owner_type = 'anonymous_web' and anonymous_session_id is not null and patient_id is null)
  )
);
-- 익명 세션 하나가 여러 상담방을 가질 수 있으므로 anonymous_session_id는 unique로 만들지 않는다(§4.1).
create index idx_chat_threads_patient  on chat_threads (patient_id) where patient_id is not null;
create index idx_chat_threads_anon     on chat_threads (anonymous_session_id) where anonymous_session_id is not null;
create index idx_chat_threads_activity on chat_threads (last_activity_at desc);

-- ── chat_messages: Realtime 단일 메시지 원장 (§4.3) + 카드 payload(공백2) + 시스템 이벤트(공백6) ──
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  ai_chat_session_id uuid,           -- FK Task 2. 세션 XOR 티켓(정확히 하나)
  support_ticket_id  uuid,           -- FK Task 2
  sender_type text not null check (sender_type in ('patient', 'bot', 'staff', 'system')),
  sender_patient_id           uuid references patients(id),
  sender_anonymous_session_id uuid,  -- FK Task 3
  sender_staff_id             uuid references staff(id),
  message_type text not null default 'text'
    check (message_type in ('text', 'card', 'quick_replies', 'system')),
  content text,                      -- text 유형 본문. card/quick_replies/system은 payload가 알맹이(설계결정 2)
  payload jsonb,                     -- 카드 스냅샷·빠른답변 버튼·시스템 이벤트 종류(카드 스키마는 Task 6)
  client_message_id uuid,            -- 환자·직원 재전송 멱등 키(§4.3)
  created_at timestamptz not null default now(),

  -- 세션 XOR 티켓: 정확히 하나 (§4.3)
  constraint chat_messages_session_ticket_xor check (
    (ai_chat_session_id is not null) <> (support_ticket_id is not null)
  ),
  -- 발신 주체별 형태 (§4.3)
  constraint chat_messages_sender_shape check (
    case sender_type
      when 'patient' then
        ((sender_patient_id is not null) <> (sender_anonymous_session_id is not null))
        and sender_staff_id is null
      when 'staff' then
        sender_staff_id is not null and sender_patient_id is null
        and sender_anonymous_session_id is null and support_ticket_id is not null
      when 'bot' then
        sender_patient_id is null and sender_anonymous_session_id is null
        and sender_staff_id is null and ai_chat_session_id is not null
      when 'system' then
        sender_patient_id is null and sender_anonymous_session_id is null
        and sender_staff_id is null
      else false
    end
  ),
  -- 유형별 본문/payload (공백2·6; 설계결정 2 — 3A text-only content not null을 카드/시스템 추가로 완화)
  constraint chat_messages_type_shape check (
    case message_type
      when 'text'          then content is not null and length(btrim(content)) > 0 and payload is null
      when 'card'          then payload is not null
      when 'quick_replies' then payload is not null
      when 'system'        then payload is not null
      else false
    end
  ),
  -- 시스템 유형 ↔ 시스템 발신자는 짝이다(설계결정 1: 단일 원장에 시스템 경계 보존).
  constraint chat_messages_system_pairing check (
    (message_type = 'system') = (sender_type = 'system')
  )
);
-- 상담방 타임라인·재연결 누락 조회(§6). client_message_id는 non-null 전역 unique(고엔트로피 UUID 1회 논리 전송).
create index idx_chat_messages_thread  on chat_messages (thread_id, created_at, id);
create index idx_chat_messages_ticket  on chat_messages (support_ticket_id, created_at, id) where support_ticket_id is not null;
create index idx_chat_messages_session on chat_messages (ai_chat_session_id, created_at, id) where ai_chat_session_id is not null;
create unique index idx_chat_messages_client_msg on chat_messages (client_message_id) where client_message_id is not null;

-- 발신자↔상담방 소유권 일치(§4.3): 로그인 환자 발신자는 상담방 patient_id, 익명 발신자는 상담방 anonymous_session_id와 같아야 한다.
-- (세션/티켓의 thread_id 일치 트리거는 그 표를 만드는 Task 2가 얹는다.) RLS 우회를 위해 security definer + public 정규화.
create or replace function validate_chat_message_sender_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid; v_anon_id uuid;
begin
  select patient_id, anonymous_session_id into v_patient_id, v_anon_id
    from public.chat_threads where id = new.thread_id;
  if new.sender_patient_id is not null and new.sender_patient_id is distinct from v_patient_id then
    raise exception '메시지 발신 환자가 상담방 소유자와 다릅니다.' using errcode = 'P0001';
  end if;
  if new.sender_anonymous_session_id is not null and new.sender_anonymous_session_id is distinct from v_anon_id then
    raise exception '메시지 발신 익명 세션이 상담방과 다릅니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_validate_chat_message_sender_thread
  before insert on chat_messages
  for each row execute function validate_chat_message_sender_thread();

-- ── chat_read_states: 참여자별 확인 위치 + "지금 보고 있음" heartbeat (§4.6) ──
create table chat_read_states (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id),
  reader_type text not null check (reader_type in ('patient', 'anonymous_web', 'staff')),
  reader_patient_id           uuid references patients(id),
  reader_anonymous_session_id uuid,   -- FK Task 3
  reader_staff_id             uuid references staff(id),
  last_read_message_id uuid references chat_messages(id),
  last_read_at timestamptz,
  active_view_until timestamptz,      -- 짧은 열람 heartbeat 만료. 영구 is_viewing=true 금지(§4.6)
  updated_at timestamptz not null default now(),
  constraint chat_read_states_reader_shape check (
    case reader_type
      when 'patient'       then reader_patient_id is not null and reader_anonymous_session_id is null and reader_staff_id is null
      when 'anonymous_web' then reader_anonymous_session_id is not null and reader_patient_id is null and reader_staff_id is null
      when 'staff'         then reader_staff_id is not null and reader_patient_id is null and reader_anonymous_session_id is null
      else false
    end
  )
);
-- 참여자·상담방 조합당 한 행(§4.6) — reader_type별 부분 unique로 세 종류를 각각 강제.
create unique index idx_chat_read_states_patient on chat_read_states (thread_id, reader_patient_id)           where reader_type = 'patient';
create unique index idx_chat_read_states_anon    on chat_read_states (thread_id, reader_anonymous_session_id) where reader_type = 'anonymous_web';
create unique index idx_chat_read_states_staff   on chat_read_states (thread_id, reader_staff_id)             where reader_type = 'staff';
create index idx_chat_read_states_last_read on chat_read_states (last_read_message_id) where last_read_message_id is not null;

-- ── RLS (§7) — 이 태스크가 담을 수 있는 것만. 직원 읽기는 티켓 배정에 달렸으므로 Task 2가 추가한다. ──
alter table chat_threads     enable row level security;
alter table chat_messages    enable row level security;
alter table chat_read_states enable row level security;
grant select on table chat_threads  to authenticated;
grant select on table chat_messages to authenticated;
grant select, insert, update on table chat_read_states to authenticated;

-- 환자는 본인·가족(활성 링크) 소유 상담방과 그 메시지를 읽는다. 익명 상담방·메시지는 백엔드가 토큰 해시로
-- 범위를 좁혀 서비스 역할로 반환한다(§7·§4.5). 메시지·봇·시스템 쓰기는 send_message 등 서비스 함수(Task 2)로만.
create policy "patients_read_own_threads" on chat_threads
  for select using (owner_type = 'patient' and patient_owns(patient_id));

create policy "patients_read_own_messages" on chat_messages
  for select using (exists (
    select 1 from chat_threads t
    where t.id = chat_messages.thread_id and t.owner_type = 'patient' and patient_owns(t.patient_id)));

-- 환자는 자기 읽음 커서만 만들고 갱신한다(상담방 열람 heartbeat 포함).
create policy "patients_manage_own_read_state" on chat_read_states
  for all
  using (reader_type = 'patient' and reader_patient_id = private.current_patient_id()
    and exists (select 1 from chat_threads t where t.id = chat_read_states.thread_id and patient_owns(t.patient_id)))
  with check (reader_type = 'patient' and reader_patient_id = private.current_patient_id()
    and exists (select 1 from chat_threads t where t.id = chat_read_states.thread_id and patient_owns(t.patient_id)));
