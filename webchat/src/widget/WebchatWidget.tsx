import { useState, type ReactNode } from 'react';
import type { WebchatApi } from '../api/webchatApi';
import { useWebchat } from '../state/useWebchat';
import { Launcher } from './Launcher';
import { ChatRoom } from './ChatRoom';
import { GuideBanner } from './GuideBanner';
import { HandoffBadge } from './HandoffBadge';

export type PendingAction = { kind: 'view_my_appointments' | 'book' | 'cancel'; payload?: Record<string, unknown> };
export type HandoffSummary = { threadId: string; summary: string[] };
export type WidgetProps = {
  api: WebchatApi;
  hospitalPhone: string;
  onAuthGate: (action: PendingAction) => void;      // → WEBMOD-AUTH(Task 15)
  onHandoffNeeded: (summary: HandoffSummary) => void; // → WEBANON-HANDOFF(Task 15)
  renderCard: (payload: Record<string, unknown> | null | undefined) => ReactNode; // → WEBCARD(Task 15)
};

export function WebchatWidget({ api, onAuthGate, onHandoffNeeded, renderCard }: WidgetProps) {
  const [open, setOpen] = useState(false);
  const w = useWebchat(api);

  const openRoom = async () => { setOpen(true); await w.open(); };
  return (
    <>
      <Launcher open={open} hasUnread={w.handoff.phase === 'answered'} onOpen={openRoom} onClose={() => setOpen(false)} />
      {open && (
        <div>
          <button type="button" aria-label="닫기" onClick={() => setOpen(false)}>×</button>
          <ChatRoom
            phase={w.phase}
            messages={w.messages}
            onSend={w.send}
            onResend={w.resend}
            onRetryLoad={w.retryLoad}
            guideSlot={<GuideBanner active={w.guide.active} text={w.guide.text} />}
            handoffSlot={<HandoffBadge status={w.handoff} onRetry={() => api.fetchHandoff(w.session!.threadId).then(w.setHandoff)} />}
            renderCard={renderCard}
          />
          {/* 로그인 필요 행동·직원 문의는 콜백만 부른다 — 화면은 Task 15. 원래 행동은 인증/인계 전 실행하지 않는다. */}
          <button type="button" onClick={() => onAuthGate({ kind: 'view_my_appointments' })}>내 예약 조회</button>
          <button type="button" onClick={() => w.session && onHandoffNeeded({ threadId: w.session.threadId, summary: [] })}>직원에게 문의</button>
        </div>
      )}
    </>
  );
}
