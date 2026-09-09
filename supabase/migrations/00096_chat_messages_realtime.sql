-- 00096 — chat_messages 를 Realtime publication 에 등록.
--
-- 버그(2026-09-09 실기기): 직원이 답장해도 환자 상담방에 메시지가 **실시간으로 안 뜬다**.
--   원인: 앱/직원웹이 `chat_messages` 를 Supabase `.stream()`(postgres_changes)로 구독하는데,
--   이 테이블이 `supabase_realtime` publication 에 **한 번도 등록된 적이 없다**(00053 주석은 "Realtime
--   단일 메시지 원장"이라 했지만 publication 등록 문이 빠졌다). publication 에 없는 테이블은 구독해도
--   창구에서 조용히 아무것도 흘리지 않는다 → 직원 라이브 메시지 미도달.
--   (봇 답변은 전송 응답으로, 환자 본인 메시지는 낙관적 추가로 떠서 이 구멍이 그동안 안 보였다.
--    인계 상태 배지는 별도 폴링이라 '답변 도착'만 바뀌고 정작 답변 본문은 안 붙던 증상.)
-- RLS 는 이미 열려 있다(00053 patients_read_own_messages = 자기 스레드의 직원 메시지까지 select 허용).
-- typing/viewing presence 는 broadcast 라 publication 과 무관(영향 없음).
-- 멱등: 이미 등록돼 있으면 건너뛴다(00039 패턴과 동일).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;
