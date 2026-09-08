import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// [Q18③/WEBCHAT-HANDOFF] 직원이 상담 상세를 **열어 보는 중**인지(열람 presence)를 구독한다.
// 직원웹 TicketDetail이 열려 있으면 같은 thread 채널(`chat-typing:<threadId>`)로 `viewing` broadcast를
// 보낸다(구독=on, 닫힘=off). 배정(claim)과 무관한 실열람 — connecting에 겹치면 배지가 "직원이 확인
// 중이에요"로 바뀐다. 끔 신호 유실 대비 12초 안전 타임아웃. threadId가 없으면(로딩 전) false.
// ⛔ 온라인 초록 점·답변 보장이 아니다(SCOPE-01) — 잠깐의 열람 표시일 뿐.
export function useStaffPresence(threadId: string | undefined): boolean {
  const [viewing, setViewing] = useState(false);
  const offTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!threadId) {
      setViewing(false);
      return;
    }
    const ch = supabase.channel(`chat-typing:${threadId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'viewing' }, (msg: { payload?: unknown }) => {
      // onBroadcast는 메시지 전체를 준다 — 실제 값은 payload에 있다(양쪽 형태 방어).
      const data = (msg.payload ?? msg) as { role?: string; on?: boolean };
      if (data.role !== 'staff') return;
      if (offTimer.current) clearTimeout(offTimer.current);
      setViewing(!!data.on);
      if (data.on) {
        offTimer.current = setTimeout(() => setViewing(false), 12000);
      }
    });
    ch.subscribe();
    return () => {
      if (offTimer.current) clearTimeout(offTimer.current);
      supabase.removeChannel(ch);
      setViewing(false);
    };
  }, [threadId]);

  return viewing;
}
