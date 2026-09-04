import { useState, useEffect, type ReactNode } from 'react';
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
  open?: boolean;                                   // 제어 모드(홈페이지 iframe이 host:setOpen으로 연다). 없으면 자체 상태로 연다(단독 배포).
  onOpenChange?: (open: boolean) => void;           // 열림 상태 변화를 부모에 통지(WebchatApp이 webchat:setOpen 송신)
  onUnreadChange?: (hasUnread: boolean) => void;    // 미읽음(직원 답변 도착) 변화를 부모에 통지(webchat:unread 송신)
};

export function WebchatWidget({ api, onAuthGate, onHandoffNeeded, renderCard, extraCards = [], open: openProp, onOpenChange, onUnreadChange }: WidgetProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;               // 제어 모드면 부모 값, 아니면 자체 상태
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const w = useWebchat(api);
  const hasUnread = w.handoff.phase === 'answered';
  const openSession = w.open;                        // 안정 useCallback(=[api])
  // 열림으로 전이될 때마다 세션 확보(기존 openRoom = setOpen(true)+w.open() 동작을 그대로 보존).
  useEffect(() => { if (open) openSession(); }, [open, openSession]);
  useEffect(() => { onUnreadChange?.(hasUnread); }, [hasUnread, onUnreadChange]);

  return (
    <>
      <Launcher open={open} hasUnread={hasUnread} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />
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
            // 인계 배지는 실제 인계가 시작(phase 확정)되거나 조회 실패일 때만 — 그 전엔 "상태 확인 중…"을 상시 노출하지 않는다.
            handoffSlot={(w.handoff.phase !== null || w.handoff.loadError)
              ? <HandoffBadge status={w.handoff} onRetry={() => api.fetchHandoff(w.session!.threadId).then(w.setHandoff)} />
              : null}
            // 로그인 필요 행동·직원 문의는 콜백만 부른다(원래 행동은 인증/인계 전 실행하지 않음). 홈페이지 챗봇 quick-chips 자리에 칩으로.
            quickActionsSlot={<>
              <button type="button" className="wc-chip" onClick={() => onAuthGate({ kind: 'view_my_appointments' })}>내 예약 조회</button>
              <button type="button" className="wc-chip" onClick={() => w.session && onHandoffNeeded({ threadId: w.session.threadId, summary: [] })}>직원에게 문의</button>
            </>}
            renderCard={(payload) => renderCard(payload, { send: w.send })}
          />
        </div>
      )}
    </>
  );
}
