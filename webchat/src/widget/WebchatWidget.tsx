import { useState, type ReactNode } from 'react';
import type { WebchatApi, ThreadMessage } from '../api/webchatApi';
import { useWebchat } from '../state/useWebchat';
import { Launcher } from './Launcher';
import { ChatRoom } from './ChatRoom';
import { GuideBanner } from './GuideBanner';
import { HandoffBadge } from './HandoffBadge';

export type PendingAction = { kind: 'view_my_appointments' | 'book' | 'cancel'; payload?: Record<string, unknown> };
export type HandoffSummary = { threadId: string; summary: string[] };
export type CardSlot = { send: (text: string) => void }; // 카드가 빠른답변을 환자 말풍선으로 보낼 통로(Task 15)
export type WidgetProps = {
  api: WebchatApi;
  hospitalPhone: string;
  onAuthGate: (action: PendingAction) => void;      // → WEBMOD-AUTH(Task 15)
  onHandoffNeeded: (summary: HandoffSummary) => void; // → WEBANON-HANDOFF(Task 15)
  renderCard: (payload: Record<string, unknown> | null | undefined, slot: CardSlot) => ReactNode; // → WEBCARD(Task 15)
  extraCards?: ThreadMessage[]; // 재확인 카드 [신청]/[취소] 실행 결과(booking_done·cancel_done 등)를 피드 끝에 얹는다(CCARD-BOOKDONE-SHOW-01). 재열기해도 살아남음(WEBCARD-BOOKDONE-03)
};

export function WebchatWidget({ api, onAuthGate, onHandoffNeeded, renderCard, extraCards = [] }: WidgetProps) {
  const [open, setOpen] = useState(false);
  const w = useWebchat(api);

  const openRoom = async () => { setOpen(true); await w.open(); };
  return (
    <>
      <Launcher open={open} hasUnread={w.handoff.phase === 'answered'} onOpen={openRoom} onClose={() => setOpen(false)} />
      {open && (
        <div className="wc-panel">
          <button type="button" className="wc-close" aria-label="닫기" onClick={() => setOpen(false)}>×</button>
          <ChatRoom
            phase={w.phase}
            messages={[...w.messages, ...extraCards]}
            onSend={w.send}
            onResend={w.resend}
            onRetryLoad={w.retryLoad}
            guideSlot={<GuideBanner active={w.guide.active} text={w.guide.text} />}
            handoffSlot={<HandoffBadge status={w.handoff} onRetry={() => api.fetchHandoff(w.session!.threadId).then(w.setHandoff)} />}
            renderCard={(payload) => renderCard(payload, { send: w.send })}
          />
          {/* 로그인 필요 행동·직원 문의는 콜백만 부른다 — 화면은 Task 15. 원래 행동은 인증/인계 전 실행하지 않는다. */}
          <button type="button" onClick={() => onAuthGate({ kind: 'view_my_appointments' })}>내 예약 조회</button>
          <button type="button" onClick={() => w.session && onHandoffNeeded({ threadId: w.session.threadId, summary: [] })}>직원에게 문의</button>
        </div>
      )}
    </>
  );
}
