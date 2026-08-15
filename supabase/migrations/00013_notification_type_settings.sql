-- 섹션4 ④ 알림 종류별 문구·문자 여부 (ui-design-decisions:3525~3539; AD-067·068 :3185~3187).
-- hospital_settings는 한 행짜리 싱글턴이라 담을 수 없다 → 종류마다 한 줄인 표(11번째가 붙어도 줄 하나만 추가).
-- 기본 문구는 DB에 넣지 않는다: 코드의 기본 문구 표가 원본이고, 줄이 없으면 코드 값을 쓴다(되돌리기=그 줄 삭제).
-- 그래서 초기 seed insert가 없다.
-- 문구 토큰(이름·날짜·시각)은 발송 시 치환한다 — appointments.slot_id → appointment_slots에서 꺼낸다(계약, 서버 로직).
create table notification_type_settings (
  notification_type text primary key,
  body text,
  also_sms boolean not null default false
);

alter table notification_type_settings enable row level security;
grant select on table notification_type_settings to authenticated;
grant insert, update, delete on table notification_type_settings to authenticated;

-- dispatcher와 직원 화면이 읽는다.
create policy "staff_can_read_notification_type_settings" on notification_type_settings
  for select
  using (private.is_active_staff());

-- 관리자만 편집(hospital_settings와 같은 패턴).
create policy "admin_can_manage_notification_type_settings" on notification_type_settings
  for all
  using (private.is_admin())
  with check (private.is_admin());
