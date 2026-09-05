-- 00079_chat_log_admin_read.sql
-- 상담봇 기록(/chatlog, 관리자 전용 — DEMO-REVIEW F-1) 백엔드 열람 권한.
--   AI가 스스로 해결한(티켓 없는) 대화까지 전수 열람해야 한다: 요구사항 L344(앱·웹 한 목록)·
--   L206(원본 대화)·L405~406(답변 근거). 기존 staff_read_*_of_tickets(00054)는 **티켓 있는 스레드만**
--   노출하므로, 관리자 전수 열람 정책을 더한다. 추가·되돌림 가능한 RLS이고 데이터는 바꾸지 않는다.
-- ⚠️ 원격 DB에는 아직 미적용 — 실제 반영은 supabase db push(또는 로컬 psql 적용) 별도 단계다.
--    (챗봇 Task 19 오버플로 — 챗봇 밴드 00053–00059 소진 + 00060–00069 배포 밴드라 꼬리 번호에 둔다,
--     MIGRATION-LEDGER 규율. 00078 다음 빈 번호 = 00079.)

-- chat_threads·chat_messages: 이미 RLS on + authenticated grant(00053). 관리자 전수 select만 더한다.
--   (RLS 정책은 OR로 합쳐지므로, 일반 직원은 여전히 티켓 스레드만·환자는 자기 것만 본다.)
create policy "admin_read_all_threads" on chat_threads
  for select using (private.is_admin());

create policy "admin_read_all_messages" on chat_messages
  for select using (private.is_admin());

-- chat_message_sources(00056)는 RLS를 켜지 않았고 grant도 없어 authenticated가 아예 못 읽는다.
--   RLS를 켜(기본 deny) 관리자 전수 select만 연다 — 환자·일반 직원에겐 여전히 닫혀 있다(범위: 관리자 chatlog 근거).
alter table chat_message_sources enable row level security;
grant select on table chat_message_sources to authenticated;

create policy "admin_read_message_sources" on chat_message_sources
  for select using (private.is_admin());
