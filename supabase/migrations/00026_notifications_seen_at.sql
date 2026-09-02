-- 갭 #22·B-11(결정 2026-08-18 「알림함 데이터 저장 방식」): 알림 「읽음」을 담을 유일한 칸.
-- 「알림함을 열면 전부 읽음」(NOTI-READ-04)이라 계정당 시각 하나로 충분하다.
--   안 읽은 개수 = notification_log에서 patient_id=이 계정 중 sent_at > notifications_seen_at.
--   읽음 처리 = 알림함 진입 순간 이 칸을 now()로.
-- ⛔ notification_log(발송 로그)에 read_at을 얹지 않는다 — 발송 관심사와 읽음 관심사를 섞지 않는다(기각 ①).
-- ⚠️ 번호는 Task 6(00025 cancellation_actor) 다음 = 00026. (00025 DDL 소유=Task 6로 확정, C2-#6 2026-08-20.)
alter table patients add column if not exists notifications_seen_at timestamptz;
-- NULL = 한 번도 알림함을 안 연 계정 → 모든 알림이 안 읽음(coalesce로 -infinity 취급).

-- 00011이 예고한 「환자 앱 알림함이 본인 알림을 읽는 정책은 3단계(환자 인증 연동)에서 추가한다」를 여기서 채운다.
-- notification_log는 dispatcher가 서비스 역할(RLS 우회)로만 쓰고, 읽기는 지금까지 staff(00011)만 있었다.
-- 환자는 acquire_as(본인 auth)로 열어 본인 계정(account_patient_id) 앞으로 온 알림만 읽는다.
-- patient_id는 언제나 로그인 계정(가족 예약도 소유자에게 보내고 대상자 이름은 body에 있음 · NOTI-READ-08).
drop policy if exists "patients_can_read_own_notifications" on notification_log;
create policy "patients_can_read_own_notifications" on notification_log
  for select using (patient_owns(patient_id));

-- 읽음 처리 = notifications_seen_at 한 칸 갱신. 그런데 00017은 「patients 직접 UPDATE 정책은
-- 두지 않는다(칼럼 단위 보호)」가 설계다 — 환자가 통째 UPDATE하면 phone·is_active 같은 민감 칸까지
-- 바꿀 수 있어서다. 그래서 seen_at만 건드리는 definer 창구를 둔다(T5·T7의 definer 창구 선례).
-- 인자 없이 private.current_patient_id()로 「본인 행」만 갱신 → 남의 seen_at은 절대 못 건드린다.
create or replace function mark_notifications_seen()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.patients set notifications_seen_at = now()
   where id = private.current_patient_id();
end;
$$;
revoke execute on function mark_notifications_seen() from public;
grant execute on function mark_notifications_seen() to authenticated;
