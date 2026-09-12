-- 3-A 통합 대화 스키마 ③ 익명 소유권 + 알림 배칭 + notification_log 연결 (§4.5·§4.7·§5).
-- notification_log는 00011에 이미 적용 → 표 복제 없이 FK·허용값·배치 링크만 확장(§5 두 갈래 중 후자).
-- 번호: MIGRATION-LEDGER 정본 00055(anonymous_chat_notifications) — 플랜 산문은 +1(00054)로 읽는다.

-- ── anonymous_chat_sessions: 브라우저 익명 토큰의 단방향 해시 (§4.5) ──
create table anonymous_chat_sessions (
  id uuid primary key default gen_random_uuid(),        -- 내부 PK. 브라우저에 노출할 토큰이 아님
  token_hash text not null unique,                      -- 고엔트로피 원문 토큰의 해시. 원문 저장 금지
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- 토큰 만료 기간은 3-A 미확정(§4.5). 임의 제품값을 넣지 않는다 — 회전·폐기 가능성만 둔다(revoked_at).

-- ── anonymous_chat_contacts: 익명 직원답변 SMS용 검증 연락처 (§4.5) ──
create table anonymous_chat_contacts (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id uuid not null references anonymous_chat_sessions(id),
  contact_kind text not null default 'phone' check (contact_kind in ('phone')),
  contact_value_ciphertext text not null,               -- 원문 전화번호 암호화 저장(평문 금지)
  contact_value_hash text not null,                     -- 정규화 번호의 단방향 해시(검증·중복용, 환자 추측매칭 금지)
  verified_at timestamptz,                              -- 소유 확인 시각. 알림·복원은 검증 후만(§4.5)
  answer_notification_enabled_at timestamptz,           -- 이 상담 답변 SMS 수신 동의 시각(광고 동의 아님)
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_anon_contacts_session on anonymous_chat_contacts (anonymous_session_id, contact_kind)
  where revoked_at is null;

-- ── Task 1·2 익명 앞선 FK를 채운다 (설계결정 3) ──
alter table chat_threads     add constraint chat_threads_anon_fk
  foreign key (anonymous_session_id) references anonymous_chat_sessions(id);
alter table chat_messages    add constraint chat_messages_sender_anon_fk
  foreign key (sender_anonymous_session_id) references anonymous_chat_sessions(id);
alter table chat_read_states add constraint chat_read_states_reader_anon_fk
  foreign key (reader_anonymous_session_id) references anonymous_chat_sessions(id);

-- ── chat_notification_batches: 미확인 연속 직원 답변 한 묶음 (§4.7) ──
create table chat_notification_batches (
  id uuid primary key default gen_random_uuid(),        -- PK 및 알림 멱등 키
  thread_id uuid not null references chat_threads(id),
  ticket_id uuid not null references support_tickets(id),
  recipient_type text not null check (recipient_type in ('patient', 'anonymous_chat_contact')),
  recipient_patient_id uuid references patients(id),
  recipient_anonymous_session_id uuid references anonymous_chat_sessions(id),
  recipient_anonymous_contact_id uuid references anonymous_chat_contacts(id),
  first_message_id uuid not null references chat_messages(id),
  last_message_id uuid not null references chat_messages(id),
  message_count int not null default 1 check (message_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notification_requested_at timestamptz,                -- 알림 발송 요청 시각(한 번만)
  acknowledged_at timestamptz,                          -- 사용자가 이 묶음을 확인한 시각
  -- 수신자 형태 (§4.7): patient면 patient_id만, anonymous_chat_contact면 세션+연락처 둘 다
  constraint batch_recipient_shape check (
    (recipient_type = 'patient'
       and recipient_patient_id is not null
       and recipient_anonymous_session_id is null and recipient_anonymous_contact_id is null)
    or (recipient_type = 'anonymous_chat_contact'
       and recipient_patient_id is null
       and recipient_anonymous_session_id is not null and recipient_anonymous_contact_id is not null)
  )
);
-- 티켓·수신자당 열린 배치(acknowledged_at is null) 하나 — 동시 답변 중복 방지(§4.7·§8-6).
create unique index idx_batch_open_patient on chat_notification_batches (ticket_id, recipient_patient_id)
  where acknowledged_at is null and recipient_type = 'patient';
create unique index idx_batch_open_anon on chat_notification_batches (ticket_id, recipient_anonymous_contact_id)
  where acknowledged_at is null and recipient_type = 'anonymous_chat_contact';
create index idx_batch_thread on chat_notification_batches (thread_id, created_at);

-- ── notification_log 확장(§5) — 표 복제 없이 FK·배치 링크만 ──
alter table notification_log
  add column recipient_type text check (recipient_type in ('patient', 'anonymous_chat_contact')),
  add column chat_notification_batch_id uuid references chat_notification_batches(id),
  add constraint notification_log_anon_session_fk
    foreign key (anonymous_session_id) references anonymous_chat_sessions(id),
  add constraint notification_log_anon_contact_fk
    foreign key (anonymous_contact_id) references anonymous_chat_contacts(id);
-- 한 배치에 로그 한 행(§5). 상담 답변 알림의 dispatcher 멱등 자물쇠.
-- ⚠️ 이름 idx_notification_log_chat_batch — staff-web T30(00050)이 이미 batch_id용 idx_notification_log_batch를
--    갖고 있어 이름 충돌을 피한다(챗봇 chat_notification_batch_id는 별도 칼럼·별도 배치 체계).
create unique index idx_notification_log_chat_batch on notification_log (chat_notification_batch_id)
  where chat_notification_batch_id is not null;
-- 익명 세션별 발송 이력 조회(§6).
create index idx_notification_log_anon_session on notification_log (anonymous_session_id, sent_at)
  where anonymous_session_id is not null;

-- ══ 익명 소유권 primitive ══
-- 같은 브라우저 토큰(해시)이면 기존 세션 반환, 없으면 생성. 원문 토큰은 백엔드가 해시해서 넘긴다(DB에 원문 없음).
create or replace function upsert_anonymous_session(p_token_hash text)
returns anonymous_chat_sessions language plpgsql security definer set search_path = '' as $$
declare v_row public.anonymous_chat_sessions;
begin
  update public.anonymous_chat_sessions set last_seen_at = now()
    where token_hash = p_token_hash and revoked_at is null
    returning * into v_row;
  if found then return v_row; end if;
  insert into public.anonymous_chat_sessions (token_hash) values (p_token_hash) returning * into v_row;
  return v_row;
end;
$$;

-- 연락처 소유 확인 완료(SMS OTP 성공 뒤 호출, 챌린지는 Task 15). 검증+수신 동의를 함께 찍는다.
-- ⚠️ contact_value_hash가 patients.phone과 같아도 chat_threads.patient_id를 채우지 않는다(§4.5·§8-9).
create or replace function record_verified_anonymous_contact(
  p_session_id uuid, p_ciphertext text, p_hash text)
returns anonymous_chat_contacts language plpgsql security definer set search_path = '' as $$
declare v_row public.anonymous_chat_contacts;
begin
  insert into public.anonymous_chat_contacts
    (anonymous_session_id, contact_kind, contact_value_ciphertext, contact_value_hash,
     verified_at, answer_notification_enabled_at)
  values (p_session_id, 'phone', p_ciphertext, p_hash, now(), now())
  returning * into v_row;
  return v_row;
end;
$$;

-- ══ 배칭 primitive (§4.7·§8-6~8) ══
-- 직원 답변 메시지 뒤 호출. 수신자가 보고 있으면 즉시 읽음(배치·알림 없음), 아니면 배치 생성/확장.
-- notification_log 행은 만들지 않는다(설계결정 1) — 배치+notification_requested_at까지. dispatcher가 발송.
create or replace function enqueue_staff_reply_notification(p_message_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.chat_messages; v_thread public.chat_threads;
  v_rtype text; v_patient uuid; v_anon_session uuid; v_anon_contact uuid;
  v_viewing boolean; v_batch uuid;
begin
  select * into v_msg from public.chat_messages where id = p_message_id;
  if v_msg.sender_type <> 'staff' or v_msg.support_ticket_id is null then
    raise exception '직원 티켓 답변만 알림 배치가 됩니다.' using errcode = 'P0001';
  end if;
  select * into v_thread from public.chat_threads where id = v_msg.thread_id;
  if v_thread.owner_type = 'patient' then
    v_rtype := 'patient'; v_patient := v_thread.patient_id;
  else
    v_rtype := 'anonymous_chat_contact'; v_anon_session := v_thread.anonymous_session_id;
    select id into v_anon_contact from public.anonymous_chat_contacts
      where anonymous_session_id = v_anon_session and contact_kind = 'phone'
        and verified_at is not null and answer_notification_enabled_at is not null and revoked_at is null
      order by verified_at desc limit 1;
    if v_anon_contact is null then return null; end if;   -- 검증 연락처 없으면 SMS 대상 없음 → 배치·알림 없음
  end if;
  -- 지금 보고 있으면(§8-8) 즉시 읽음, 배치·알림 없음.
  select (active_view_until is not null and active_view_until > now()) into v_viewing
    from public.chat_read_states
    where thread_id = v_thread.id
      and ((v_rtype='patient' and reader_type='patient' and reader_patient_id=v_patient)
        or (v_rtype='anonymous_chat_contact' and reader_type='anonymous_web'
            and reader_anonymous_session_id=v_anon_session));
  if coalesce(v_viewing, false) then
    update public.chat_read_states set last_read_message_id=p_message_id, last_read_at=now(), updated_at=now()
      where thread_id = v_thread.id
        and ((v_rtype='patient' and reader_type='patient' and reader_patient_id=v_patient)
          or (v_rtype='anonymous_chat_contact' and reader_type='anonymous_web'
              and reader_anonymous_session_id=v_anon_session));
    return null;
  end if;
  -- 열린 배치가 있으면 확장(알림 재요청 안 함, §8-7), 없으면 새로 + 알림 한 번 요청.
  update public.chat_notification_batches
     set last_message_id=p_message_id, message_count=message_count+1, updated_at=now()
   where ticket_id=v_msg.support_ticket_id and acknowledged_at is null
     and ((v_rtype='patient' and recipient_patient_id=v_patient)
       or (v_rtype='anonymous_chat_contact' and recipient_anonymous_contact_id=v_anon_contact))
   returning id into v_batch;
  if found then return v_batch; end if;
  insert into public.chat_notification_batches
    (thread_id, ticket_id, recipient_type, recipient_patient_id,
     recipient_anonymous_session_id, recipient_anonymous_contact_id,
     first_message_id, last_message_id, message_count, notification_requested_at)
  values (v_thread.id, v_msg.support_ticket_id, v_rtype,
     case when v_rtype='patient' then v_patient end,
     case when v_rtype='anonymous_chat_contact' then v_anon_session end,
     case when v_rtype='anonymous_chat_contact' then v_anon_contact end,
     p_message_id, p_message_id, 1, now())
  returning id into v_batch;
  return v_batch;   -- dispatcher가 notification_requested_at 있고 log 없는 배치를 집어 발송(§5)
exception when unique_violation then
  -- 동시 답변 경쟁: 다른 트랜잭션이 방금 배치를 만들었다 → 그 배치를 확장한다(§8-6).
  update public.chat_notification_batches
     set last_message_id=p_message_id, message_count=message_count+1, updated_at=now()
   where ticket_id=v_msg.support_ticket_id and acknowledged_at is null
     and ((v_rtype='patient' and recipient_patient_id=v_patient)
       or (v_rtype='anonymous_chat_contact' and recipient_anonymous_contact_id=v_anon_contact))
   returning id into v_batch;
  return v_batch;
end;
$$;

-- 사용자가 상담방을 확인하면 열린 배치를 닫는다(§8-7). 그 뒤 새 답변은 새 배치.
create or replace function acknowledge_chat_batches(p_thread_id uuid, p_reader_type text, p_reader_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_notification_batches
     set acknowledged_at = now(), updated_at = now()
   where thread_id = p_thread_id and acknowledged_at is null
     and ((p_reader_type='patient' and recipient_patient_id = p_reader_id)
       or (p_reader_type='anonymous_web' and recipient_anonymous_session_id = p_reader_id));
end;
$$;

-- ── RLS (§7) ── 익명 표는 authenticated 직접 조회 금지(백엔드가 토큰 해시 검증 후 서비스 역할로 범위 반환).
alter table anonymous_chat_sessions enable row level security;
alter table anonymous_chat_contacts enable row level security;
alter table chat_notification_batches enable row level security;
-- grant/policy 없음: 익명 세션·연락처·배치는 서비스 역할(RLS 우회 함수)로만 접근. 직원 화면(Task 17~19)이
-- 필요로 하는 마스킹 표시는 서비스 계층이 만든다(§4.5·§7 — 로그·payload에 원문 연락처·토큰 해시 노출 금지).
