import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebchatApi, SessionState, ThreadMessage, HandoffStatus, GuideState } from '../api/webchatApi';
import type { BotDone, StaffMessage } from '../widget/useStaffPresence';
import type { WebchatPhase } from '../widget/ChatRoom';
import type { OutagePhase } from '../widget/OutageNotice';
import { loadAnonToken, saveAnonToken } from './anonSession';

const uuid = () => crypto.randomUUID();

// 실시간 봇 답을 못 받았을 때 DB 재조회로 복구하기까지 기다리는 시간(CHAT-STREAM-FALLBACK-01).
const STREAM_FALLBACK_MS = 45000;

// AI 응답 기능 장애 판정(WEBCHAT-OUTAGE-01): 서버 5xx나 status 없는 네트워크 실패는 "AI에 못 닿음"이라
// 장애 안내를 띄운다. 4xx(세션 만료·권한 등)는 장애가 아니라 다른 경로가 처리하므로 배너를 띄우지 않는다.
function isOutageError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /^webchat_api_(\d{3})$/.exec(msg);
  if (m) return Number(m[1]) >= 500;   // 5xx = 서버/AI 장애
  return true;                          // status 없는 네트워크 실패도 응답을 못 받음 → 장애로 안내
}

export function useWebchat(api: WebchatApi, opts: { onHandoffRequested?: (threadId: string) => void } = {}) {
  const { onHandoffRequested } = opts; // route_taken=handoff(타이핑 "직원 연결" 즉시 인계, ⓪-b) → 인계 폼(WEBANON-HANDOFF)
  const [phase, setPhase] = useState<WebchatPhase>('firstConsult');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [handoff, setHandoff] = useState<HandoffStatus>({ phase: null, isOpen: false });
  const [guide, setGuide] = useState<GuideState>({ active: false, text: '' });
  const [botTyping, setBotTyping] = useState(false); // 답변 대기 중 타이핑 표시(홈페이지 .typing 재현)
  const [urgent, setUrgent] = useState(false);       // route_taken='emergency' 감지 → 긴급 안내(WEBCHAT-URGENT)
  const [outage, setOutage] = useState<OutagePhase | null>(null); // AI 응답 장애(WEBCHAT-OUTAGE). null=정상
  // 진행 중 봇 스트림 버블(누적 텍스트). done에서 확정 말풍선으로 커밋하고 비운다.
  const [streaming, setStreaming] = useState<{ gen: string; text: string } | null>(null);
  const inFlight = useRef<Set<string>>(new Set()); // 중복 전송 방지(clientMessageId)
  const activeGen = useRef<string | null>(null);   // 지금 기다리는 답변의 gen(다른 gen 조각은 폐기)
  const latestText = useRef('');                   // 누적 본문(상태 클로저 지연 없이 done에서 확정에 쓴다)
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 실시간 유실/미도달 복구(CHAT-STREAM-FALLBACK-01): DB가 정본 — 봇 답을 다시 읽어 피드를 정본으로 맞춘다.
  const reconcileFromServer = useCallback(async () => {
    if (!session) return;
    try {
      const msgs = await api.fetchMessages(session.threadId);
      setMessages(msgs);
    } catch {
      /* 복구 실패는 조용히 — 다음 왕복·폴링에서 재시도(성공 위장 안 함) */
    }
  }, [api, session]);

  const clearFallback = useCallback(() => {
    if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
  }, []);

  const dispatchSend = useCallback(async (content: string, clientMessageId: string) => {
    if (!session || inFlight.current.has(clientMessageId)) return; // 멱등 중복 차단
    inFlight.current.add(clientMessageId);
    setMessages((m) => upsertLocal(m, { content, clientMessageId, sendState: 'sending' }));
    setBotTyping(true);                                // 봇 답변을 기다리는 동안 타이핑 표시
    try {
      const ack = await api.sendMessage({ threadId: session.threadId, aiSessionId: session.aiSessionId, content, clientMessageId });
      setMessages((m) => markSent(m, clientMessageId)); // 내 말풍선만 sent(봇 답은 실시간)
      if (ack.routeTaken === 'staff') {
        // 인계(사람 상담) 모드 — 봇이 생성하지 않는다. 타이핑 점을 끄고 실시간 봇 이벤트를 기다리지 않는다.
        setBotTyping(false);
        activeGen.current = null;
        return;
      }
      // 지금부터 도착할 bot_delta/bot_done을 이 gen으로 받는다(다른 gen 조각은 폐기).
      activeGen.current = ack.gen;
      latestText.current = '';
      setStreaming(null);
      // 실시간을 못 받으면(유실) 일정 시간 뒤 DB 재조회로 복구한다.
      clearFallback();
      fallbackTimer.current = setTimeout(() => {
        activeGen.current = null; setStreaming(null); setBotTyping(false);
        void reconcileFromServer();
      }, STREAM_FALLBACK_MS);
    } catch (err) {
      setMessages((m) => markFailed(m, clientMessageId)); // 성공 위장 금지(WEBCHAT-ROOM-09) — 실패 말풍선 유지
      setBotTyping(false);
      if (isOutageError(err)) setOutage('idle');          // AI 장애 안내(WEBCHAT-OUTAGE-01) — 실패 말풍선과 공존
    } finally {
      inFlight.current.delete(clientMessageId);
    }
  }, [api, session, reconcileFromServer, clearFallback]);

  // [CHAT-STREAM-STAFF-MSG-01] 인계 후 직원 답장을 피드에 붙인다(실시간 채널 수신). 익명 웹챗은
  //   chat_messages 테이블 구독 불가(RLS)라 이 경로가 직원 답의 유일한 실시간 도달점이다. DB가 정본이므로
  //   id로 중복을 막는다(broadcast와 재조회가 겹쳐도 말풍선이 두 번 붙지 않는다).
  const applyStaffMessage = useCallback((m: StaffMessage) => {
    setMessages((list) => list.some((x) => x.id === m.id)
      ? list
      : [...list, { id: m.id, senderType: 'staff', messageType: 'text', content: m.content }]);
  }, []);

  // ── 실시간 봇 스트림 반영(useStaffPresence 콜백에서 부른다) ──
  const applyBotTyping = useCallback((on: boolean) => {
    setBotTyping(on);
  }, []);

  const applyBotDelta = useCallback((gen: string, _seq: number, text: string) => {
    if (activeGen.current !== gen) return;              // 남의 답 조각 폐기
    latestText.current = latestText.current + text;
    setStreaming({ gen, text: latestText.current });
  }, []);

  const applyBotDone = useCallback((p: BotDone) => {
    if (activeGen.current !== p.gen) return;
    clearFallback();
    setBotTyping(false);
    activeGen.current = null;
    const text = latestText.current;
    latestText.current = '';
    setStreaming(null);
    if (p.outage) { setOutage('idle'); return; }        // 빈 답(AI 장애) — 봇 말풍선 없음
    setOutage(null);                                    // 봇 답 도착 → 장애 해제(성공 왕복)
    if (text) {
      // 스트리밍된 본문을 확정 말풍선으로 커밋(+ done이 실은 카드).
      const card = p.card as Record<string, unknown> | null;
      setMessages((m) => [
        ...m,
        { id: p.messageId ?? `bot-${p.gen}`, senderType: 'bot', messageType: 'text', content: text },
        ...(card && typeof card.card_type === 'string'
          ? [{ id: `card-${p.gen}`, senderType: 'bot' as const, messageType: 'card' as const, content: null, payload: card }]
          : []),
      ]);
    } else {
      // 델타 없는 빠른 경로(emergency·no_answer·intent·카드) — DB 정본에서 봇 답을 채운다(카드 포함).
      void reconcileFromServer();
    }
    // 긴급/안내/인계 전이는 이제 done의 routeTaken으로 반영(WEBCHAT-URGENT-01·WEBANON-HANDOFF).
    setUrgent(p.routeTaken === 'emergency');
    if (p.routeTaken === 'department_guide') setGuide({ active: true, text: '진료과 안내 진행 중' });
    else setGuide((g) => ({ ...g, active: false }));
    if (p.routeTaken === 'handoff') onHandoffRequested?.(session?.threadId ?? '');
  }, [clearFallback, reconcileFromServer, onHandoffRequested, session]);

  // Q18①: 인계 상태를 능동적으로 가져온다 — 예전엔 setHandoff로만 갱신해 폼 제출 후에도 배지가 안 떴다.
  //   진입/새로고침 시 1회 + 이후 주기 폴링으로 최신 상태(connecting→answered)를 배지에 반영한다.
  const refreshHandoff = useCallback(async () => {
    if (!session) return;
    try {
      const st = await api.fetchHandoff(session.threadId);
      setHandoff(st);
    } catch {
      setHandoff((h) => ({ ...h, loadError: true }));
    }
  }, [api, session]);

  useEffect(() => {
    if (!session) return;
    void refreshHandoff();                               // 진입 즉시(기존 인계 복원·제출 후 반영)
    const id = setInterval(() => { void refreshHandoff(); }, 8000); // 이후 상태 변화(답변 도착) 반영
    return () => clearInterval(id);
  }, [session, refreshHandoff]);

  useEffect(() => () => clearFallback(), [clearFallback]); // 언마운트 시 타이머 정리

  const send = useCallback((content: string) => dispatchSend(content, uuid()), [dispatchSend]);
  const resend = useCallback((clientMessageId: string) => {
    const prev = messages.find((x) => x.clientMessageId === clientMessageId);
    if (prev) return dispatchSend(prev.content ?? '', clientMessageId); // 동일 키 재전송
  }, [dispatchSend, messages]);

  return {
    phase, session, messages, handoff, guide, botTyping,
    streaming,                                         // 진행 중 봇 스트림 버블(위젯이 messages 뒤에 합성)
    urgent, outage, setOutage,                         // 긴급/장애 상태(WEBCHAT-URGENT·WEBCHAT-OUTAGE) — 위젯이 배너로 렌더
    askedForContact: false, crossDeviceResume: false, // 익명 웹은 이름/연락처를 방 진입에서 묻지 않는다
    open, send, resend,
    applyBotTyping, applyBotDelta, applyBotDone,        // 실시간 봇 이벤트 반영(WebchatWidget이 채널 훅에 연결)
    applyStaffMessage,                                 // [CHAT-STREAM-STAFF-MSG-01] 인계 후 직원 답장 수신
    retryLoad: open,
    acknowledgeView: useCallback(async () => { if (session) await api.acknowledgeBatches(session.threadId); }, [api, session]),
    setHandoff, refreshHandoff,
  };
}

// 낙관적 말풍선 헬퍼(전송 중/성공/실패 상태 전이)
function upsertLocal(list: ThreadMessage[], p: { content: string; clientMessageId: string; sendState: 'sending' }): ThreadMessage[] {
  return [...list, { id: `local-${p.clientMessageId}`, senderType: 'patient', messageType: 'text', ...p }];
}
function markSent(list: ThreadMessage[], cid: string): ThreadMessage[] {
  // 봇 답은 실시간(bot_done)이 붙인다 — 여기선 내 말풍선만 sent로.
  return list.map((m) => (m.clientMessageId === cid ? { ...m, sendState: 'sent' as const } : m));
}
function markFailed(list: ThreadMessage[], cid: string): ThreadMessage[] {
  return list.map((m) => (m.clientMessageId === cid ? { ...m, sendState: 'failed' as const } : m));
}
