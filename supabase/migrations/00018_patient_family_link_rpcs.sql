-- [SDB-19] patient_family_links는 select만 authenticated에 열고, 변경은 RPC로만.
-- ⚠️ select 정책 `patients_can_read_own_family_links`는 **00017로 이관됨**(2026-08-29): Task 2의
--    list_accessible_patient_ids가 이미 필요로 해 신원 RLS 기반(00017)에 뒀다. 여기선 만들지 않는다.
-- ⚠️ 00045가 CHECK 제약을 걸었다: (unlinked_at·unlinked_by·unlink_reason)은 셋 다 null 또는 셋 다 not null.
--    환자 자가해제엔 staff `unlinked_by`가 없으므로(그 칸은 staff FK) 트리오를 건드리지 않고 is_active만 내린다.
--    unlinked_* 트리오는 직원 해제(사유 포함) 감사용이다.
create or replace function update_family_link_relation_self(p_link_id uuid, p_relation text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_acct uuid;
begin
  select account_patient_id into v_acct from public.patient_family_links where id = p_link_id;
  if v_acct is null or not public.patient_owns(v_acct) then
    raise exception '본인이 등록한 가족만 수정할 수 있습니다.' using errcode = 'P0001';
  end if;
  update public.patient_family_links set relation = p_relation where id = p_link_id;
end; $$;

create or replace function unlink_family_link_self(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_acct uuid;
begin
  select account_patient_id into v_acct from public.patient_family_links where id = p_link_id;
  if v_acct is null or not public.patient_owns(v_acct) then
    raise exception '본인이 등록한 가족만 연결 해제할 수 있습니다.' using errcode = 'P0001';
  end if;
  -- 00045 CHECK: 환자 자가해제는 unlinked_* 트리오를 채울 수 없으므로 is_active만 내린다.
  update public.patient_family_links set is_active = false where id = p_link_id;
end; $$;

create or replace function relink_family_link_self(p_link_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_acct uuid;
begin
  select account_patient_id into v_acct from public.patient_family_links where id = p_link_id;
  if v_acct is null or not public.patient_owns(v_acct) then
    raise exception '본인이 등록한 가족만 재연결할 수 있습니다.' using errcode = 'P0001';
  end if;
  -- 직원 해제(트리오 채워짐)였던 링크도 재연결되면 트리오를 통째로 비운다(00045 CHECK 충족).
  update public.patient_family_links
     set is_active = true, unlinked_at = null, unlinked_by = null, unlink_reason = null
   where id = p_link_id;
end; $$;

revoke execute on function update_family_link_relation_self(uuid, text) from public;
revoke execute on function unlink_family_link_self(uuid) from public;
revoke execute on function relink_family_link_self(uuid) from public;
grant execute on function update_family_link_relation_self(uuid, text) to authenticated;
grant execute on function unlink_family_link_self(uuid) to authenticated;
grant execute on function relink_family_link_self(uuid) to authenticated;
