import { useCallback, useRef, useState } from 'react';
import type { WebchatApi, SessionState, ThreadMessage, HandoffStatus, GuideState } from '../api/webchatApi';
import type { WebchatPhase } from '../widget/ChatRoom';
import { loadAnonToken, saveAnonToken } from './anonSession';

const uuid = () => crypto.randomUUID();

export function useWebchat(api: WebchatApi) {
  const [phase, setPhase] = useState<WebchatPhase>('firstConsult');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [handoff, setHandoff] = useState<HandoffStatus>({ phase: null, isOpen: false });
  const [guide, setGuide] = useState<GuideState>({ active: false, text: '' });
  const [botTyping, setBotTyping] = useState(false); // 답변 대기 중 타이핑 표시(홈페이지 .typing 재현)
  const inFlight = useRef<Set<string>>(new Set()); // 중복 전송 방지(clientMessageId)

  const open = useCallback(async () => {
    const token = loadAnonToken();          // 같은 브라우저만. 다른 기기엔 null(WEBCHAT-ROOM-05)
    setPhase(token ? 'restoring' : 'firstConsult');
    try {
      const s = await api.startOrRestoreSession(token); // 토큰 없으면 새 익명 세션(추측 조회 안 함)
      saveAnonToken(s.anonToken);
      setSession(s); setMessages(s.messages); setPhase('ready');
    } catch {
      setPhase('loadError');                // 토큰은 지우지 않는다(WEBCHAT-ROOM-07)
    }
  }, [api]);

  const dispatchSend = useCallback(async (content: string, clientMessageId: string) => {
    if (!session || inFlight.current.has(clientMessageId)) return; // 멱등 중복 차단
    inFlight.current.add(clientMessageId);
    setMessages((m) => upsertLocal(m, { content, clientMessageId, sendState: 'sending' }));
    setBotTyping(true);                                // 봇 답변을 기다리는 동안 타이핑 표시
    try {
      const out = await api.sendMessage({ threadId: session.threadId, aiSessionId: session.aiSessionId, content, clientMessageId });
      setMessages((m) => markSent(m, clientMessageId, out.botMessage, out.cardMessage));
      if (out.routeTaken === 'department_guide') setGuide({ active: true, text: '진료과 안내 진행 중' });
      else setGuide((g) => ({ ...g, active: false }));
    } catch {
      setMessages((m) => markFailed(m, clientMessageId)); // 성공 위장 금지(WEBCHAT-ROOM-09)
    } finally {
      inFlight.current.delete(clientMessageId);
      setBotTyping(false);
    }
  }, [api, session]);

  const send = useCallback((content: string) => dispatchSend(content, uuid()), [dispatchSend]);
  const resend = useCallback((clientMessageId: string) => {
    const prev = messages.find((x) => x.clientMessageId === clientMessageId);
    if (prev) return dispatchSend(prev.content ?? '', clientMessageId); // 동일 키 재전송
  }, [dispatchSend, messages]);

  return {
    phase, session, messages, handoff, guide, botTyping,
    askedForContact: false, crossDeviceResume: false, // 익명 웹은 이름/연락처를 방 진입에서 묻지 않는다
    open, send, resend,
    retryLoad: open,
    acknowledgeView: useCallback(async () => { if (session) await api.acknowledgeBatches(session.threadId); }, [api, session]),
    setHandoff,
  };
}

// 낙관적 말풍선 헬퍼(전송 중/성공/실패 상태 전이)
function upsertLocal(list: ThreadMessage[], p: { content: string; clientMessageId: string; sendState: 'sending' }): ThreadMessage[] {
  return [...list, { id: `local-${p.clientMessageId}`, senderType: 'patient', messageType: 'text', ...p }];
}
function markSent(list: ThreadMessage[], cid: string, bot?: ThreadMessage, card?: ThreadMessage): ThreadMessage[] {
  const next = list.map((m) => (m.clientMessageId === cid ? { ...m, sendState: 'sent' as const } : m));
  // 봇 말풍선 뒤에 카드(no_answer의 quick_replies)를 이어 붙인다 — 둘 다 없으면 상태 갱신만.
  return [...next, ...(bot ? [bot] : []), ...(card ? [card] : [])];
}
function markFailed(list: ThreadMessage[], cid: string): ThreadMessage[] {
  return list.map((m) => (m.clientMessageId === cid ? { ...m, sendState: 'failed' as const } : m));
}
