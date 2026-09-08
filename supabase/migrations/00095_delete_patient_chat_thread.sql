-- 00095 — 지난 상담 "진짜 삭제"(하드삭제) 함수 (챗봇 B3, 결정: 사용자 2026-09-08)
--
-- 요구사항 §6.3은 「환자정보·진료기록」의 하드삭제만 막는다(숨김 권장). 상담봇 대화는 §6.3 대상이 아니고,
-- 사용자가 지난 상담 목록의 스와이프 삭제를 "진짜 삭제"로 확정했다(확인창 필수·되돌릴 수 없음).
--
-- ⚠️ 왜 함수인가: chat_threads의 자식 FK(chat_messages·chat_read_states·ai_chat_sessions·support_tickets·
--    chat_notification_batches …)는 전부 ON DELETE 규칙이 NO ACTION이라 단순 delete가 FK 위반이 난다.
--    게다가 support_tickets ↔ ai_chat_sessions는 상호(순환) 참조라 순서만으로는 못 지운다 →
--    순환 참조를 먼저 null로 끊고 자식→부모 순서로 지운다. 소유권도 함수 안에서 다시 검사(방어적 심층).
--
-- ⚠️ 원격 미적용 — 배포 시 supabase db push. (챗봇 밴드 소진·배포 밴드라 꼬리 번호 00095, 대장 다음 빈 번호)

create or replace function public.delete_patient_chat_thread(p_thread_id uuid, p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select patient_id into v_owner
    from public.chat_threads
   where id = p_thread_id and owner_type = 'patient';
  -- 없거나 남의 상담방이면 거부(개인정보 열거 방지 위해 상위 API는 같은 문구로 처리).
  if v_owner is null or v_owner is distinct from p_patient_id then
    raise exception 'not_owner_or_missing' using errcode = '42501';
  end if;

  -- ① 알림 로그 → 배치 링크 끊기(로그·감사 행은 보존, 삭제된 배치 참조만 null)
  update public.notification_log set chat_notification_batch_id = null
    where chat_notification_batch_id in (
      select id from public.chat_notification_batches
       where thread_id = p_thread_id
          or ticket_id in (select id from public.support_tickets where thread_id = p_thread_id));

  -- ② 알림 배치(메시지·상담방·티켓 참조) + 티켓/세션의 자식들
  delete from public.chat_notification_batches
    where thread_id = p_thread_id
       or ticket_id in (select id from public.support_tickets where thread_id = p_thread_id);
  delete from public.chat_quality_reviews
    where ai_chat_session_id in (select id from public.ai_chat_sessions where thread_id = p_thread_id);
  delete from public.support_ticket_assignment_history
    where ticket_id in (select id from public.support_tickets where thread_id = p_thread_id);
  delete from public.unresolved_questions
    where ticket_id in (select id from public.support_tickets where thread_id = p_thread_id);

  -- ③ 메시지의 자식 — 피드백(큐레이션 뱅크 링크 먼저 끊음)·근거 출처
  update public.qa_example_bank set source_feedback_id = null
    where source_feedback_id in (
      select id from public.answer_feedback
       where message_id in (select id from public.chat_messages where thread_id = p_thread_id));
  delete from public.answer_feedback
    where message_id in (select id from public.chat_messages where thread_id = p_thread_id);
  delete from public.chat_message_sources
    where message_id in (select id from public.chat_messages where thread_id = p_thread_id);

  -- ④ 읽음커서(메시지 참조) 삭제·세션 요약커서 null 후 메시지 삭제
  delete from public.chat_read_states where thread_id = p_thread_id;
  update public.ai_chat_sessions set summary_last_message_id = null where thread_id = p_thread_id;
  delete from public.chat_messages    where thread_id = p_thread_id;

  -- ⑤ 순환 FK 끊기 — 이 상담방의 세션·티켓을 가리키는 상호참조(내부/외부 재문의 체인)를 null로.
  update public.support_tickets set previous_ticket_id = null
    where previous_ticket_id in (select id from public.support_tickets where thread_id = p_thread_id);
  update public.ai_chat_sessions set continued_from_ticket_id = null
    where continued_from_ticket_id in (select id from public.support_tickets where thread_id = p_thread_id);
  update public.ai_chat_sessions set continued_from_ai_session_id = null
    where continued_from_ai_session_id in (select id from public.ai_chat_sessions where thread_id = p_thread_id);
  update public.support_tickets set source_ai_session_id = null
    where source_ai_session_id in (select id from public.ai_chat_sessions where thread_id = p_thread_id);

  -- ⑥ 티켓 → 세션 → 상담방
  delete from public.support_tickets  where thread_id = p_thread_id;
  delete from public.ai_chat_sessions where thread_id = p_thread_id;
  delete from public.chat_threads     where id = p_thread_id;
end;
$$;

comment on function public.delete_patient_chat_thread(uuid, uuid) is
  '지난 상담 하드삭제(B3) — 소유권 검사 후 상담방과 모든 자식(메시지·세션·티켓·알림배치…)을 순서대로 삭제. 되돌릴 수 없음.';

revoke all on function public.delete_patient_chat_thread(uuid, uuid) from public;
grant execute on function public.delete_patient_chat_thread(uuid, uuid) to service_role;
