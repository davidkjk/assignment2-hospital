create extension if not exists pgcrypto;

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true
);

create type staff_role as enum ('receptionist', 'doctor', 'admin');

create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  name text not null,
  role staff_role not null,
  department_id uuid references departments(id),
  is_active boolean not null default true,
  deactivated_by uuid references staff(id),
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table departments enable row level security;
alter table staff enable row level security;

-- [정합성 검토 SDB-03/SDB-05] staff RLS 정책이 staff 테이블을 직접 재조회하면
-- "infinite recursion detected in policy" 오류가 난다(자기 자신의 RLS를 평가하는 도중
-- 같은 RLS를 다시 평가하려 들기 때문). 아래 private 스키마 헬퍼는 postgres 소유
-- security definer 함수라 호출 시 staff RLS를 다시 트리거하지 않고, API에도 노출되지
-- 않는다(search_path = ''로 스키마 탐색 우회 공격도 차단). 이후 모든 RLS 정책은
-- staff를 직접 재조회하지 않고 이 헬퍼만 사용한다.
create schema if not exists private;
-- USAGE가 없으면 authenticated 역할은 private.xxx() 이름 자체를 조회(lookup)할 수 없어
-- RLS 정책 안에서 이 헬퍼를 호출하는 시점에 권한 오류가 난다 — EXECUTE만으로는 부족하다.
grant usage on schema private to authenticated;

create or replace function private.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff s where s.auth_user_id = auth.uid() and s.is_active;
$$;

create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s where s.auth_user_id = auth.uid() and s.is_active;
$$;

-- [정합성 검토 R1-우선2 재검증] 이 함수가 모든 RLS 정책의 게이트라, 직원이 비활성화되면 Auth
-- 세션(리프레시 토큰)이 살아있어도 이 함수가 즉시 false를 반환해 데이터 접근을 막는다 — 그래서
-- Task 12에서 "JWT 30분 절대 만료로 충분하다"고 판단할 수 있었다(세션 존속 자체는 보안 공백이
-- 아님). 다만 세션을 실제로 끊는 절차(Task 12 deactivate_staff의 sign_out 호출)는 이 함수와
-- 별개로 필요했고 이번에 추가했다.
create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.auth_user_id = auth.uid() and s.is_active);
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.auth_user_id = auth.uid() and s.role = 'admin' and s.is_active);
$$;

revoke execute on function private.current_staff_id() from public;
revoke execute on function private.current_staff_role() from public;
revoke execute on function private.is_active_staff() from public;
revoke execute on function private.is_admin() from public;
grant execute on function private.current_staff_id() to authenticated;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.is_admin() to authenticated;

grant all on table departments to authenticated;
grant all on table staff to authenticated;

create policy "staff_can_read_departments" on departments
  for select
  using (private.is_active_staff());

create policy "admin_can_manage_departments" on departments
  for all
  using (private.is_admin())
  with check (private.is_admin());

create policy "staff_can_read_staff" on staff
  for select
  using (private.is_active_staff());

create policy "admin_can_manage_staff" on staff
  for all
  using (private.is_admin())
  with check (private.is_admin());
