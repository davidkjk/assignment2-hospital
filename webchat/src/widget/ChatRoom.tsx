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
      <header className="wc-header" role="banner">AI 상담봇{p.guideSlot}{p.handoffSlot}</header>
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
      <form className="wc-foot" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { p.onSend(draft.trim()); setDraft(''); } }}>
        <input className="wc-input" placeholder="메시지를 입력하세요" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </form>
    </section>
  );
}
