-- Task 14 / 갭 #84·#85 · [R3-03] — 예약의 실제 시각 범위·겹침 제약·Realtime publication.
--
-- ⚠️ 전제 정정: 「start_at·end_at은 00038이 이미 만들었다」는 브리핑과 달랐다.
--    00038(00038_walkin_visit_time.sql:13~15)은 워크인 방문 시각(walkin_visit_time)만 열었고,
--    "캘린더가 겹침을 시간 범위로 재기 위한 실제 시작·종료는 같은 갭 #85의 다른 갈래로
--    Task 14(00039)가 다룬다"고 스스로 못박아 두었다. 그래서 start_at/end_at은 여기서 처음 만든다.
--
-- 무엇을 얹나(CAL-GAP-09):
--   ① start_at·end_at(timestamptz) 칸 — slot_id의 「추천 자리」와 별개인 실제 시각(CAL-TIME-09·갭 #85).
--   ② allow_overlap(boolean) — 제약을 끄는 스위치가 아니라 「직원이 경고를 읽고 그대로 잡았다」는
--      사실 기록이다(CAL-GAP-06·07). 나중에 본 직원도 데이터에서 ⚠ 겹침을 읽을 수 있어야 한다.
--   ③ GiST 배제 제약 — 같은 의사의 시간 범위가 겹치면 막되, 두 행이 모두 allow_overlap=false일
--      때만 작동한다(부분 겹침을 알고 넣은 예약끼리는 겹쳐도 된다).
--   ④ 같은 시각 시작 unique(CAL-GAP-08) — :112(모르고 같은 자리에 두 명)는 :113(알고 사이에
--      끼우기)과 다르다. 시작 시각이 같으면 allow_overlap으로도 못 뚫는다.
--   ⑤ 세 테이블을 supabase_realtime publication에 등록([R3-03]).
--
-- 취소 계열(환자취소·병원취소·예약부도)은 자리를 이미 풀었으므로 제약·unique에서 뺀다
-- (00005:73의 슬롯 unique가 같은 방식으로 취소를 제외한다).

-- ── btree_gist: GiST 인덱스에서 doctor_id(uuid) 같은 스칼라 동등(=)을 범위 겹침(&&)과
--    한 제약에 섞으려면 필요하다. ──
create extension if not exists btree_gist;

-- ── ① 실제 시각 범위 (갭 #85 · CAL-GAP-09 · CAL-TIME-09) ──
alter table appointments
  add column if not exists start_at timestamptz,
  add column if not exists end_at   timestamptz;

comment on column appointments.start_at is
  '예약의 실제 시작 시각(갭 #85). slot_id의 「추천 자리」와 별개인 5분 단위 자유 시각(CAL-TIME-03·09).';
comment on column appointments.end_at is
  '예약의 실제 종료 시각 = start_at + 의사별 slot_duration_minutes(CAL-TIME-09). 겹침은 이 범위로 잰다.';

-- 종료가 시작보다 앞설 수 없다(둘 다 있을 때만 검사 — 옛 예약은 두 칸이 비어 있다).
alter table appointments
  add constraint appointments_time_range_valid
  check (start_at is null or end_at is null or end_at > start_at);

-- ── ② allow_overlap: 사실 기록(CAL-GAP-06·07) — 기본 false ──
alter table appointments
  add column if not exists allow_overlap boolean not null default false;

comment on column appointments.allow_overlap is
  '직원이 겹침 경고를 읽고 [알겠습니다, 그대로 잡기]를 눌렀다는 사실(CAL-GAP-06). '
  '제약을 끄는 스위치가 아니라, 나중에 본 직원이 ⚠ 겹침을 데이터에서 읽게 하는 기록(CAL-GAP-07).';

-- ── ③ 겹침 배제 제약(CAL-GAP-09) — 두 행이 모두 allow_overlap=false이고 취소가 아닐 때만 ──
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    doctor_id with =,
    tstzrange(start_at, end_at) with &&
  )
  where (
    not allow_overlap
    and start_at is not null
    and end_at is not null
    and status not in ('환자취소', '병원취소', '예약부도')
  );

-- ── ④ 같은 시각 시작 unique(CAL-GAP-08) — allow_overlap과 무관하게 막는다 ──
create unique index appointments_doctor_start_unique
  on appointments (doctor_id, start_at)
  where (
    start_at is not null
    and status not in ('환자취소', '병원취소', '예약부도')
  );

-- ── ⑤ Realtime publication 등록([R3-03]) — 없으면 구독해도 창구에서 조용히 실패한다 ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table appointments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'appointment_slots'
  ) then
    alter publication supabase_realtime add table appointment_slots;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'appointment_status_history'
  ) then
    alter publication supabase_realtime add table appointment_status_history;
  end if;
end $$;
