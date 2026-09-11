-- 00100 — support_tickets 를 Realtime publication 에 등록.
--
-- 버그(2026-09-10): 직원웹에서 새 상담 문의·담당/상태 변경이 **실시간으로 안 뜬다**(새로고침해야 보임).
--   원인: 직원웹이 `support_tickets` 를 Supabase postgres_changes 로 구독하는데
--   (문의함 목록 `useTicketsRealtime`·상세 `useTicketDetailRealtime.ts:25` = event '*'),
--   이 테이블이 `supabase_realtime` publication 에 **한 번도 등록된 적이 없다**
--   (00039=예약 3종, 00096=chat_messages 만 추가했고 support_tickets 는 빠졌다 — grep 확인).
--   publication 에 없는 테이블은 구독해도 창구에서 조용히 아무것도 흘리지 않는다
--   → 초기 스냅샷만 오고 이후 INSERT(새 문의)·UPDATE(담당/상태) 는 영영 미도달.
--   (`00096` 의 chat_messages 와 완전히 같은 구멍. 봇/직원 답장·typing 은 broadcast 라 무관.)
-- RLS 는 직원용으로 이미 열려 있다(문의함이 평소 조회하는 그대로). broadcast presence 는 영향 없음.
-- replica_identity: 콜백은 "다시 조회하라"는 신호일 뿐 old 값을 안 쓰므로 default(PK) 로 INSERT/UPDATE 전달 충분.
-- 멱등: 이미 등록돼 있으면 건너뛴다(00039·00096 패턴과 동일).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table support_tickets;
  end if;
end $$;
