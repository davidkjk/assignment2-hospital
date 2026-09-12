-- 00078 · 챗봇 Task 17(티켓 상세)이 소비하는 두 쓰기 primitive.
-- ⚠️ 번호: 챗봇 밴드 00053–00059가 소진됐고(7칸 전부), 00060–00069는 배포 밴드(00060=overdue_no_shows 배정).
--   밴드를 밀지 않으려 대장 규율대로(직원웹 오버플로 00070– 선례) 전역 다음 빈 번호 00078을 쓴다.
--   → docs/design/spec-index/MIGRATION-LEDGER.md 갱신(챗봇 오버플로).
-- 왜 definer 함수인가: 직원은 support_tickets·chat_read_states에 SELECT만 있고(00053·00054),
--   쓰기는 원자 primitive(claim/close/send)와 동형으로 definer 함수로만 연다. 00054가 남긴
--   "직원 읽기 커서는 티켓 배정에 달렸으므로 이후 태스크가 추가" 주석(00053:136)을 여기서 해소한다.

-- ── 담당 이관 (REASSIGN-02) ─────────────────────────────────────────────────
-- assigned_staff_id만 바꾸고 in_progress를 유지한다(재개·종료가 아니다). 대상은 활성 직원만 —
-- 역할 제한(의료판단=의사/관리자)은 화면 드롭다운이 좁히고(REASSIGN-01), 서버는 막다른 길을 만들지 않으려
-- 모든 활성 직원을 허용한다(REASSIGN-05). 변경 이력은 claim_ticket과 같은 표에 남긴다.
create or replace function reassign_ticket(p_ticket_id uuid, p_to_staff_id uuid)
returns support_tickets language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_prev uuid; v_row public.support_tickets;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 상담을 이관할 수 있습니다.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff s where s.id = p_to_staff_id and s.is_active) then
    raise exception '이관할 직원을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  select assigned_staff_id into v_prev from public.support_tickets where id = p_ticket_id for update;
  update public.support_tickets
     set assigned_staff_id = p_to_staff_id, assigned_at = now(), updated_at = now()
   where id = p_ticket_id and status = 'in_progress'
   returning * into v_row;
  if not found then raise exception '진행 중인 상담만 이관할 수 있습니다.' using errcode = 'P0001'; end if;
  insert into public.support_ticket_assignment_history (ticket_id, from_staff_id, to_staff_id, changed_by_staff_id)
  values (p_ticket_id, v_prev, p_to_staff_id, v_staff);
  return v_row;
end;
$$;

-- ── 직원 미확인 해소 (UNREAD-02) ────────────────────────────────────────────
-- 직원이 상세를 열어 환자 메시지를 보면 자기 읽음 커서를 그 메시지까지 옮긴다. 여러 기기는 서버 커서로
-- 정합화되고(마지막으로 읽은 지점), 커서는 뒤로 가지 않는다(오래된 메시지 id가 들어와도 무시).
create or replace function staff_mark_ticket_read(p_ticket_id uuid, p_message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_staff uuid; v_thread uuid; v_msg_created timestamptz;
begin
  v_staff := private.current_staff_id();
  if v_staff is null then raise exception '직원만 확인할 수 있습니다.' using errcode = 'P0001'; end if;
  select thread_id into v_thread from public.support_tickets where id = p_ticket_id;
  if v_thread is null then raise exception '문의를 찾을 수 없습니다.' using errcode = 'P0001'; end if;
  select created_at into v_msg_created from public.chat_messages where id = p_message_id and thread_id = v_thread;
  if v_msg_created is null then raise exception '해당 상담방의 메시지가 아닙니다.' using errcode = 'P0001'; end if;
  insert into public.chat_read_states (thread_id, reader_type, reader_staff_id, last_read_message_id, last_read_at)
  values (v_thread, 'staff', v_staff, p_message_id, now())
  on conflict (thread_id, reader_staff_id) where reader_type = 'staff'
  do update set last_read_message_id = excluded.last_read_message_id, last_read_at = now(), updated_at = now()
  where coalesce(
    (select created_at from public.chat_messages where id = public.chat_read_states.last_read_message_id),
    '-infinity'::timestamptz) < v_msg_created;
end;
$$;
