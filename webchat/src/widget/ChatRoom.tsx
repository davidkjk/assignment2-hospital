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

export function ChatRoom(p: ChatRoomProps) {
  const [draft, setDraft] = useState('');
  return (
    <section role="region" aria-label="AI 상담봇" data-widget="true">
      <header role="banner">AI 상담봇{p.guideSlot}{p.handoffSlot}</header>
      {p.phase === 'restoring' && <div role="status">불러오는 중…</div>}
      <ul>
        {p.messages.map((m) => (
          <li key={m.id} data-send-state={m.sendState ?? 'sent'}>
            {m.messageType === 'card' ? p.renderCard(m.payload) : m.content}
            {m.sendState === 'failed' && (
              <button type="button" onClick={() => m.clientMessageId && p.onResend(m.clientMessageId)}>재전송</button>
            )}
          </li>
        ))}
      </ul>
      {p.phase === 'loadError' && (
        <div>
          <p>대화를 불러오지 못했어요.</p>
          <button type="button" onClick={p.onRetryLoad}>다시 시도</button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { p.onSend(draft.trim()); setDraft(''); } }}>
        <input placeholder="메시지를 입력하세요" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </form>
    </section>
  );
}
