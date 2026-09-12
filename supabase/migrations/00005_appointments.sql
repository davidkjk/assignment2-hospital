create table appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references staff(id),
  slot_date date not null,
  start_time time not null,
  status text not null default '빈시간' check (status in ('빈시간', '예약됨', '휴진')),
  unique (doctor_id, slot_date, start_time)
);

-- [정합성 검토 SDB-20] 3단계(환자 앱)의 patients_can_update_slots_for_booking 정책은 status만
-- 검사하고 doctor_id/slot_date/start_time은 검사하지 않는다. 그래서 환자가 REST를 직접 호출하면
-- 자신이 UPDATE 가능한 슬롯(빈 슬롯 또는 본인 예약 슬롯)의 담당의·날짜·시간까지 바꿀 수 있었다.
-- 실제로 이 세 칼럼을 바꾸는 정상 흐름은 없다(일정 재생성은 슬롯을 DELETE 후 다시 INSERT하는
-- 방식이다 — staff-web Task 참고). 그래서 이 세 칼럼은 역할과 무관하게 아예 불변으로 만든다.
-- book_slot()/release_slot()은 status만 바꾸므로 이 트리거의 영향을 받지 않는다.
create or replace function block_appointment_slot_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.doctor_id is distinct from old.doctor_id
     or new.slot_date is distinct from old.slot_date
     or new.start_time is distinct from old.start_time then
    raise exception '슬롯의 담당의·날짜·시간은 만든 뒤에는 바꿀 수 없습니다. 슬롯을 다시 만드세요.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_block_appointment_slot_identity_change
  before update on appointment_slots
  for each row execute function block_appointment_slot_identity_change();

create table appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references appointment_slots(id),
  account_patient_id uuid not null references patients(id),
  for_patient_id uuid not null references patients(id),
  department_id uuid not null references departments(id),
  doctor_id uuid not null references staff(id),
  reason text,
  status text not null check (status in (
    '예약신청', '예약확정', '도착', '진료대기', '진료중', '진료완료',
    '환자취소', '병원취소', '예약부도'
  )),
  source text not null check (source in ('app', 'chatbot', 'staff')),
  queue_position int,
  is_urgent_flag boolean not null default false,
  booking_code varchar(6),
  booking_code_expires_at timestamptz,
  created_by uuid references staff(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- [정합성 검토 R4-04] booking_code는 항상 유니크(NULL은 여러 개 허용)하게 강제한다.
-- 주의: `where booking_code_expires_at > now()` 같은 부분 인덱스는 Postgres에서 불가능하다
-- (부분 인덱스 조건절에는 IMMUTABLE 함수만 쓸 수 있는데 now()는 STABLE이라 마이그레이션 자체가 실패한다).
-- 대신 만료된 코드는 아래 트리거/배치가 booking_code를 NULL로 비워 값을 재사용 가능하게 만든다.
create unique index idx_appointments_booking_code on appointments (booking_code);

-- [정합성 검토 브리프B/APPT-RACE] slot_id는 nullable FK일 뿐이라, book_slot()의 조건부 UPDATE를
-- 거치지 않는 직접 INSERT(향후 환자 앱/챗봇 예약 경로 우회 포함)로 같은 slot_id에 활성 예약을 여러 건
-- 만들 수 있었다 — enforce_appointment_consistency() 트리거는 담당의 일치만 볼 뿐 중복 점유는 보지 않는다.
-- 슬롯을 실제로 점유하는 '살아있는' 예약은 같은 slot_id에 최대 한 건만 존재하도록 DB가 최종 심판한다.
-- 취소류(환자취소/병원취소/예약부도)는 슬롯을 놓아준 상태이므로 유니크에서 제외해 재예약을 허용한다
-- (release_slot()이 슬롯 status를 '빈시간'으로 되돌리는 것과 짝을 이룬다). 부분 인덱스 조건절은
-- IMMUTABLE 비교(slot_id is not null·status not in 상수)뿐이라 마이그레이션이 실패하지 않는다.
create unique index idx_appointments_active_slot on appointments (slot_id)
  where slot_id is not null and status not in ('환자취소', '병원취소', '예약부도');

-- [정합성 검토 R4-04] 6자리 코드 생성: 대문자+숫자, 혼동되는 0/O, 1/I 제외. 충돌 시 재시도는 호출부(트리거)가 담당한다.
create or replace function generate_booking_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (random() * 32)::int + 1, 1), '')
  from generate_series(1, 6);
$$;

-- [정합성 검토 R4-04] 예약 생성 시 코드를 발급하고, 슬롯 날짜 다음날 자정을 만료 시각으로 잡는다.
-- 슬롯이 없는 예약(source='chatbot' 등 슬롯 미지정)은 생성 시점 + 1일을 만료 시각으로 잡는다.
create or replace function assign_booking_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_date date;
  v_code text;
  v_attempt int := 0;
begin
  if new.slot_id is not null then
    select slot_date into v_slot_date from public.appointment_slots where id = new.slot_id;
  end if;
  new.booking_code_expires_at := coalesce(v_slot_date, current_date) + interval '1 day';

  -- BEFORE INSERT 트리거 안에서는 아직 행이 실제로 들어가기 전이라 유니크 제약 위반 예외를
  -- 받을 수 없다. 그래서 후보 코드가 이미 쓰이고 있는지 직접 조회해서 재시도한다.
  loop
    v_code := public.generate_booking_code();
    v_attempt := v_attempt + 1;
    exit when not exists (select 1 from public.appointments where booking_code = v_code);
    if v_attempt > 10 then
      raise exception '예약번호 발급에 반복적으로 실패했습니다.' using errcode = 'P0001';
    end if;
  end loop;

  new.booking_code := v_code;
  return new;
end;
$$;

create trigger trg_assign_booking_code
  before insert on appointments
  for each row execute function assign_booking_code();

-- [정합성 검토 R4-04] 예약이 종료 상태(진료완료/취소류)가 되면 즉시 코드를 비워 값을 재사용 가능하게 만든다
-- (예약 기록 자체는 그대로 보존 — booking_code만 NULL로 비운다).
create or replace function expire_booking_code_on_terminal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('진료완료', '환자취소', '병원취소', '예약부도') and new.booking_code is not null then
    new.booking_code := null;
    new.booking_code_expires_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_expire_booking_code_on_terminal_status
  before update of status on appointments
  for each row execute function expire_booking_code_on_terminal_status();

-- [정합성 검토 R4-04] "슬롯 날짜 당일 경과" 만료는 시각이 아니라 날짜 경과로 트리거되므로
-- INSERT/UPDATE 트리거만으로는 잡을 수 없다. 2단계(직원 웹) 예약번호 검색 API는 반드시
-- `where booking_code = $1 and booking_code_expires_at > now()`로 조회해 만료 여부를 조회
-- 시점에 다시 확인한다(값 재사용을 위한 실제 NULL 비우기는 2단계에서 하루 1회 배치로 처리).

create table appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  from_status text,
  to_status text not null,
  changed_by uuid not null references staff(id),
  reason text,
  changed_at timestamptz not null default now()
);

alter table appointment_slots enable row level security;
alter table appointments enable row level security;
alter table appointment_status_history enable row level security;

grant select, insert, update on table appointment_slots to authenticated;
grant select, insert, update on table appointments to authenticated;
grant select, insert on table appointment_status_history to authenticated;

-- [정합성 검토 R2-02] 의사는 원칙적으로 본인 담당(doctor_id = 본인) 예약만 조회할 수 있다.
-- 예외: 오늘 그 의사에게 '도착'/'진료대기'/'진료중' 상태로 와 있는 환자(for_patient_id 동일)라면,
-- 그 환자의 이미 종료된(과거) 예약·진료기록은 담당의가 달랐더라도 진료 연속성을 위해 열람을 허용한다.
-- 아직 지나지 않은 미래 예약(다른 의사 담당)은 이 예외로도 열람할 수 없다 — 종료 여부를 함께 검사하기 때문이다.
-- 접수직원·관리자는 이 함수를 거치지 않고 전체 열람 정책을 그대로 유지한다(운영상 전체 환자를 다뤄야 함).
create or replace function doctor_can_view_appointment(target_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments target
    join public.staff me on me.auth_user_id = auth.uid() and me.role = 'doctor' and me.is_active
    left join public.appointment_slots ts on ts.id = target.slot_id
    where target.id = target_appointment_id
      and (
        target.doctor_id = me.id
        or (
          (
            target.status in ('진료완료', '환자취소', '병원취소', '예약부도')
            or (ts.slot_date is not null and ts.slot_date < current_date)
          )
          and exists (
            select 1 from public.appointments live
            where live.doctor_id = me.id
              and live.for_patient_id = target.for_patient_id
              and live.status in ('도착', '진료대기', '진료중')
          )
        )
      )
  );
$$;

revoke execute on function doctor_can_view_appointment(uuid) from public;
grant execute on function doctor_can_view_appointment(uuid) to authenticated;

-- [정합성 검토 SDB-06] Task 3(00003_patients.sql)에서는 접수직원·관리자만 patients를 조회할 수 있게
-- 해두었다(그 시점엔 appointments가 없어 의사 범위를 정할 수 없었다). 이제 appointments가 생겼으니
-- doctor_can_view_appointment()와 같은 "본인 담당 예약 또는 진료 연속성" 규칙을 환자 단위로 재사용해
-- 의사의 patients 조회 범위를 제한한다 — 담당 아닌 환자는 UUID를 알아도 조회되지 않는다.
create or replace function doctor_can_view_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments target
    left join public.appointment_slots ts on ts.id = target.slot_id
    where target.for_patient_id = target_patient_id
      and (
        target.doctor_id = private.current_staff_id()
        or (
          (
            target.status in ('진료완료', '환자취소', '병원취소', '예약부도')
            or (ts.slot_date is not null and ts.slot_date < current_date)
          )
          and exists (
            select 1 from public.appointments live
            where live.doctor_id = private.current_staff_id()
              and live.for_patient_id = target_patient_id
              and live.status in ('도착', '진료대기', '진료중')
          )
        )
      )
  );
$$;

revoke execute on function doctor_can_view_patient(uuid) from public;
grant execute on function doctor_can_view_patient(uuid) to authenticated;

create policy "doctor_can_read_scoped_patients" on patients
  for select
  using (private.current_staff_role() = 'doctor' and doctor_can_view_patient(id));

create policy "staff_can_read_slots" on appointment_slots
  for select
  using (private.is_active_staff());

create policy "receptionist_admin_can_manage_slots" on appointment_slots
  for all
  using (private.current_staff_role() in ('receptionist', 'admin'))
  with check (private.current_staff_role() in ('receptionist', 'admin'));

create policy "staff_can_read_appointments" on appointments
  for select
  using (
    private.current_staff_role() in ('receptionist', 'admin')
    or doctor_can_view_appointment(id)
  );

create policy "receptionist_admin_can_insert_appointments" on appointments
  for insert
  with check (private.current_staff_role() in ('receptionist', 'admin'));

create policy "staff_can_update_own_scope_appointments" on appointments
  for update
  using (
    exists (
      select 1 from staff s
      where s.auth_user_id = auth.uid() and s.is_active
        and (s.role in ('receptionist', 'admin') or s.id = appointments.doctor_id)
    )
  )
  with check (
    exists (
      select 1 from staff s
      where s.auth_user_id = auth.uid() and s.is_active
        and (s.role in ('receptionist', 'admin') or s.id = appointments.doctor_id)
    )
  );

create policy "staff_can_read_status_history" on appointment_status_history
  for select
  using (
    private.current_staff_role() in ('receptionist', 'admin')
    or doctor_can_view_appointment(appointment_id)
  );

-- 주의: appointment_status_history에는 클라이언트가 직접 INSERT할 수 있는 정책을 두지 않는다.
-- 이력 기록은 아래 log_appointment_status_change() 트리거(SECURITY DEFINER)만 담당하며,
-- 이렇게 해야 "이력 없이 상태만 슬쩍 바꾸는" 우회가 원천적으로 불가능하다.

-- ── 치명적 규칙은 DB가 최종 심판 ──────────────────────────────────────────
-- ①: 예약의 담당의가 실제로 활성 상태의 의사인지, 소속 진료과가 예약 진료과와
--    일치하는지, 슬롯을 지정한 경우 슬롯 담당의와 예약 담당의가 같은지 검증한다.
create or replace function enforce_appointment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_role public.staff_role;
  v_doctor_dept uuid;
  v_doctor_active boolean;
  v_slot_doctor uuid;
begin
  select role, department_id, is_active into v_doctor_role, v_doctor_dept, v_doctor_active
  from public.staff where id = new.doctor_id;

  if v_doctor_role is null or v_doctor_role <> 'doctor' or not coalesce(v_doctor_active, false) then
    raise exception '담당의로 지정한 직원이 활성 상태의 의사가 아닙니다.' using errcode = 'P0001';
  end if;

  if new.department_id is distinct from v_doctor_dept then
    raise exception '담당의의 소속 진료과와 예약 진료과가 일치하지 않습니다.' using errcode = 'P0001';
  end if;

  if new.slot_id is not null then
    select doctor_id into v_slot_doctor from public.appointment_slots where id = new.slot_id;
    if v_slot_doctor is distinct from new.doctor_id then
      raise exception '선택한 시간대의 담당의와 예약 담당의가 일치하지 않습니다.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_appointment_consistency
  before insert or update of doctor_id, department_id, slot_id on appointments
  for each row execute function enforce_appointment_consistency();

-- ②: 예약 상태전이는 정해진 경로만 허용한다(직접 UPDATE로 임의 상태 점프 차단).
-- primary key (from_status, to_status)는 두 칼럼 모두 NOT NULL을 강제하므로 (null, ...) 행은 절대 넣지 않는다
-- (정합성 검토 SDB-02 — 예전 초안은 초기 상태 행을 NULL로 넣으려 해서 마이그레이션이 실패했다).
-- [정합성 검토 SDB-17] 이 표는 사용자 업무 데이터가 아니라 "어떤 상태전이가 허용되는지"를 정의하는
-- 내부 보안 규칙표다. public 스키마에 RLS 없이 두면 Supabase 기본 권한상 authenticated 역할이
-- 직접 SELECT/INSERT/UPDATE/DELETE할 수 있어 클라이언트가 규칙 자체를 조작할 위험이 있다.
-- private 스키마에는 authenticated/anon에게 기본으로 어떤 테이블 권한도 없으므로(1단계 Task 1에서
-- private 스키마 자체 USAGE만 부여했을 뿐 테이블 권한은 부여하지 않았다) 이 표를 private에 두는 것만으로
-- 일반 세션의 직접 접근이 전부 거부된다. 아래 enforce_appointment_status_transition() 트리거는
-- security definer(테이블 소유자 postgres 권한으로 실행)라 RLS/테이블 권한과 무관하게 이 표를 읽을 수 있다.
create table private.appointment_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

insert into private.appointment_status_transitions (from_status, to_status) values
  ('예약신청', '예약확정'), ('예약신청', '환자취소'), ('예약신청', '병원취소'),
  ('예약확정', '도착'), ('예약확정', '환자취소'), ('예약확정', '병원취소'), ('예약확정', '예약부도'),
  ('도착', '진료대기'),
  ('진료대기', '진료중'),
  ('진료중', '진료완료');

-- 전이 검증은 UPDATE(이후 실제 상태변경)에만 건다 — INSERT 시점 초기 상태는 이 표로 강제하지 않는다.
-- 테스트 픽스처가 흔히 쓰는 "완료 상태로 미리 씨딩" 같은 직접 INSERT 셋업을 막지 않기 위해서다.
-- 초기 상태 자체의 채널별 제한(예: 앱은 '예약신청'만 등)은 이번 5건 수정 범위 밖의 별도 보완 과제로 남긴다.
create or replace function enforce_appointment_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from private.appointment_status_transitions
      where from_status is not distinct from old.status and to_status = new.status
    ) then
      raise exception '''%'' 상태에서 ''%''(으)로 변경할 수 없습니다.', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_appointment_status_transition
  before update of status on appointments
  for each row execute function enforce_appointment_status_transition();

-- ③: 상태 변경 이력은 서비스 코드가 아니라 트리거가 자동으로 남긴다(생성 시 초기 이력 포함).
-- 서비스는 `set local app.status_change_reason = '<사유>'`로 사유만 세션에 실어두면 된다.
create or replace function log_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_old_status text;
begin
  v_old_status := case when tg_op = 'INSERT' then null else old.status end;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    select id into v_staff_id from public.staff where auth_user_id = auth.uid();
    -- auth.uid()가 없는 세션(배포 시드 스크립트 등 JWT 클레임 없이 직접 접속)에는 changed_by가 NOT NULL이라
    -- 행위자를 못 찾으면 이력 행을 만들지 않고 조용히 건너뛴다(제약 위반으로 시드/배치가 깨지는 것을 방지).
    if v_staff_id is not null then
      insert into public.appointment_status_history (appointment_id, from_status, to_status, changed_by, reason)
      values (
        new.id, v_old_status, new.status, v_staff_id,
        coalesce(current_setting('app.status_change_reason', true), case when tg_op = 'INSERT' then '예약 생성' else null end)
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_log_appointment_status_change
  after insert or update of status on appointments
  for each row execute function log_appointment_status_change();

-- 클라이언트가 실제 상태전이를 흉내낸 이력을 직접 꾸며 넣을 수는 없지만(위 INSERT 정책 없음),
-- 순서 재배치처럼 상태변화가 없는 관리 메모는 from_status = to_status인 행만 허용해 예외로 둔다.
create policy "staff_can_insert_note_history" on appointment_status_history
  for insert
  with check (
    from_status = to_status
    and private.is_active_staff()
  );
