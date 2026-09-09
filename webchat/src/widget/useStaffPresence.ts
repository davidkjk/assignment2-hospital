import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// [Q18③/WEBCHAT-HANDOFF] 직원이 상담 상세를 **열어 보는 중**인지(열람 presence)를 구독한다.
// 직원웹 TicketDetail이 열려 있으면 같은 thread 채널(`chat-typing:<threadId>`)로 `viewing` broadcast를
// 보낸다(구독=on, 닫힘=off). 배정(claim)과 무관한 실열람 — connecting에 겹치면 배지가 "직원이 확인
// 중이에요"로 바뀐다. 끔 신호 유실 대비 12초 안전 타임아웃. threadId가 없으면(로딩 전) false.
// ⛔ 온라인 초록 점·답변 보장이 아니다(SCOPE-01) — 잠깐의 열람 표시일 뿐.
//
// [CHAT-ROOM-PATIENT-PRESENCE-01·PATIENT-TYPING-01] 방향은 양쪽이다 — 같은 채널로 이 위젯(환자)의
// 열람(방 열림)·입력 중도 `role:'patient'`로 보낸다(직원웹이 "환자 접속/입력 중" 표시). 새 채널을 또
// 열면 같은 토픽 2채널=한쪽 유실 버그가 재발하므로 반드시 이 채널로 보낸다. viewing:on은 구독 후 1회,
// off는 언마운트 시. typing은 notifyTyping이 첫 입력에 on 한 번 + 유휴 3초 off(환자앱 컨트롤러와 대칭).
export function useStaffPresence(threadId: string | undefined): {
  staffViewing: boolean;
  notifyTyping: () => void;
} {
  const [viewing, setViewing] = useState(false);
  const offTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingOn = useRef(false);
  const typingIdle = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (data.role !== 'staff') return; // 내(환자) viewing은 표시하지 않는다
      if (offTimer.current) clearTimeout(offTimer.current);
      setViewing(!!data.on);
      if (data.on) {
        offTimer.current = setTimeout(() => setViewing(false), 12000);
      }
    });
    ch.subscribe((status: string) => {
      // 구독 전 send는 유실된다 — subscribed 후에 환자 열람 presence를 켠다.
      if (status === 'SUBSCRIBED') {
        void ch.send({ type: 'broadcast', event: 'viewing', payload: { role: 'patient', on: true } });
      }
    });
    chanRef.current = ch;
    return () => {
      if (offTimer.current) clearTimeout(offTimer.current);
      if (typingIdle.current) clearTimeout(typingIdle.current);
      typingOn.current = false;
      // 위젯을 닫으면 환자 열람 종료를 알린다(직원 화면의 "환자 접속 중"이 내려간다).
      void ch.send({ type: 'broadcast', event: 'viewing', payload: { role: 'patient', on: false } });
      supabase.removeChannel(ch);
      chanRef.current = null;
      setViewing(false);
    };
  }, [threadId]);

  // 입력창 글자가 바뀔 때마다 부른다. 첫 입력에 typing on을 한 번, 유휴 3초면 off(직원웹 setTyping 대칭).
  const notifyTyping = useCallback(() => {
    const ch = chanRef.current;
    if (!ch) return;
    if (!typingOn.current) {
      typingOn.current = true;
      void ch.send({ type: 'broadcast', event: 'typing', payload: { role: 'patient', on: true } });
    }
    if (typingIdle.current) clearTimeout(typingIdle.current);
    typingIdle.current = setTimeout(() => {
      typingOn.current = false;
      void ch.send({ type: 'broadcast', event: 'typing', payload: { role: 'patient', on: false } });
    }, 3000);
  }, []);

  return { staffViewing: viewing, notifyTyping };
}
