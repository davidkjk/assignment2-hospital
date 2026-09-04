import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ThreadMessage } from '../api/webchatApi';

export type WebchatPhase = 'firstConsult' | 'restoring' | 'ready' | 'loadError';
export type ChatRoomProps = {
  phase: WebchatPhase;
  messages: ThreadMessage[];
  onSend: (text: string) => void;
  onResend: (clientMessageId: string) => void;
  onRetryLoad: () => void;
  guideSlot: ReactNode;
  handoffSlot: ReactNode;
  quickActionsSlot?: ReactNode;   // 입력바 위 상시 빠른행동 칩(내 예약 조회·직원에게 문의). 홈페이지 챗봇의 quick-chips 자리.
  renderCard: (payload: Record<string, unknown> | null | undefined) => ReactNode;
};

// 말풍선 정렬: 환자=오른쪽 딥틸, 봇/직원=왼쪽 흰카드, 시스템=가운데(ROOM-08)
function bubbleClass(senderType: ThreadMessage['senderType']): string {
  if (senderType === 'patient') return 'wc-msg wc-msg--me';
  if (senderType === 'system') return 'wc-msg wc-msg--system';
  return 'wc-msg wc-msg--bot';
}

export function ChatRoom(p: ChatRoomProps) {
  const [draft, setDraft] = useState('');
  return (
    <section className="wc-room" role="region" aria-label="AI 상담봇" data-widget="true">
      <header className="wc-header" role="banner">
        <span className="wc-header__av" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16v12H9l-5 3V5Z" /><path d="M8 10h8M8 13h5" />
          </svg>
        </span>
        <span className="wc-header__title">
          AI 상담봇
          <span className="wc-header__status"><i className="wc-header__dot" aria-hidden="true" />지금 응답 가능</span>
        </span>
      </header>
      {/* 진료과 배너·인계 상태 — 헤더가 아니라 대화 영역에 둔다(WEBCHAT-GUIDE: 추천 중에만 메시지와 함께). */}
      <div className="wc-status">{p.guideSlot}{p.handoffSlot}</div>
      {p.phase === 'restoring' && <div className="wc-loading" role="status">불러오는 중…</div>}
      <ul className="wc-body">
        {p.messages.map((m) => (
          <li
            key={m.id}
            data-send-state={m.sendState ?? 'sent'}
            className={m.messageType === 'card' ? 'wc-cardline' : bubbleClass(m.senderType)}
          >
            {m.messageType === 'card' ? p.renderCard(m.payload) : m.content}
            {m.sendState === 'failed' && (
              <button type="button" onClick={() => m.clientMessageId && p.onResend(m.clientMessageId)}>재전송</button>
            )}
          </li>
        ))}
      </ul>
      {p.phase === 'loadError' && (
        <div className="wc-error">
          <p>대화를 불러오지 못했어요.</p>
          <button type="button" onClick={p.onRetryLoad}>다시 시도</button>
        </div>
      )}
      <div className="wc-foot">
        {p.quickActionsSlot && <div className="wc-quick wc-quick--actions">{p.quickActionsSlot}</div>}
        <form className="wc-inputbar" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { p.onSend(draft.trim()); setDraft(''); } }}>
          <input className="wc-input" placeholder="메시지를 입력하세요" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="wc-send" aria-label="보내기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}
