-- Task 21a — 중복 환자 병합 원장·계보·감사 (B-4 해소, 정합성 검토 R5-05)
-- 결정 #15(원본 보존 + 계보) · #16(관리자 직접 되돌림, Task 26) · #17(별도 감사 사건)
--
-- ⭐ 원장 = 계보. 이 표 하나가 「무엇을 합쳤나」이자 「대표가 함께 읽을 ID들」이다.
--    둘로 나누면 병합과 계보가 어긋날 수 있다(원장엔 있는데 계보엔 없는 상태). 한 표면
--    원자적으로 같이 생기고, 되돌림도 undone_at 하나로 계보에서 저절로 빠진다.

-- ── 계정 연결 칸 (MERGE-COMPARE-04 / MERGE-STATE-04) ──────────────────────────
-- patients↔인증계정 연결은 3단계(환자 앱)가 정식화하지만, 병합이 「두 기록 모두 계정이
-- 연결되어 있으면 자동 병합 불가」를 판정하려면 지금 이 칸이 필요하다. 병합이 첫 소비자다.
-- ⚠️ 이월: 3단계에서 auth.users FK·환자 로그인 모델과 맞출 것(지금은 순수 uuid 표식).
alter table patients add column auth_user_id uuid unique;

-- ── 병합 원장 = 계보 단일표 ───────────────────────────────────────────────────
create table patient_merges (
  id uuid primary key default gen_random_uuid(),
  primary_patient_id  uuid not null references patients(id),
  merged_patient_id   uuid not null references patients(id),
  performed_by uuid not null references staff(id),
  performed_at timestamptz not null default now(),
  -- MERGE-AUDIT-01: 「데이터 건수 스냅샷」 — 병합 당시 무엇이 얼마였는지({primary, merged}).
  -- 나중에 세면 값이 달라져 「그때 무엇을 보고 눌렀나」를 재현할 수 없다.
  counts_snapshot jsonb not null,
  account_link_moved boolean not null default false,   -- MERGE-COMPARE-04
  -- MERGE-UNDO-01: 되돌림은 Task 26이 채운다. 여기는 소프트 되돌림 「스키마」까지만.
  undone_at timestamptz,
  undone_by uuid references staff(id),
  undo_reason text,
  constraint patient_merges_undo_all_or_none check (
    (undone_at is null and undone_by is null and undo_reason is null)
    or (undone_at is not null and undone_by is not null and undo_reason is not null)),
  constraint patient_merges_not_self check (primary_patient_id <> merged_patient_id)
);

-- MERGE-RACE-01: 살아 있는 병합은 한 쌍에 하나뿐. 되돌린 것은 이 제약 밖이라 재병합이 열린다.
create unique index patient_merges_live_pair
  on patient_merges (primary_patient_id, merged_patient_id) where undone_at is null;
-- 합쳐진 쪽이 또 다른 병합의 대표가 되면 계보가 나무가 아니라 그물이 된다.
create unique index patient_merges_live_merged
  on patient_merges (merged_patient_id) where undone_at is null;

-- MERGE-DATA-01~03: 대표가 함께 읽어야 할 환자 ID 전부. 병합이 이어질 수 있어 재귀다.
-- undone_at is null인 병합만 따라간다 → 되돌린 병합은 저절로 계보에서 빠진다.
create or replace function patient_lineage(root uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  with recursive tree as (
    select root as id
    union
    select m.merged_patient_id
      from public.patient_merges m
      join tree t on t.id = m.primary_patient_id
     where m.undone_at is null
  )
  select array_agg(id) from tree;
$$;

-- MERGE-AUDIT-01 / ALOG-LIST-12: merge 사건이 「어느 병합인지」를 가리킨다.
-- 00034가 사건 종류(patient_merge·patient_merge_undo)만 열어 뒀고 가리킬 칸이 없었다.
-- 성공 병합은 resource_id = patient_merges.id, 거절은 resource_id = null로 구분한다.
alter table access_audit_log add column resource_id uuid references patient_merges(id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table patient_merges enable row level security;
-- 되돌림(update)은 Task 26이 소유하므로 여기서 update 권한을 열지 않는다 — 스키마에서 막는다.
grant select, insert on table patient_merges to authenticated;
create policy admin_can_read_patient_merges on patient_merges
  for select using (private.is_admin());
create policy admin_can_insert_patient_merges on patient_merges
  for insert with check (private.is_admin());
