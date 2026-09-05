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
  urgentSlot?: ReactNode;         // 긴급 안내 배너(WEBCHAT-URGENT) — 긴급 표현 감지 시 대화 위에 고정.
  outageSlot?: ReactNode;         // AI 장애 안내(WEBCHAT-OUTAGE) — 전화·문의 남기기가 주 경로. 기존 대화와 함께 유지.
  startSlot?: ReactNode;          // 첫 상담(빈 피드) 시작 안내 — 봇 인사말 + 시작 고정 칩(WEBCHAT-ROOM-03·WEBCARD-QUICK-01). 대화 영역 안에 렌더.
  botTyping?: boolean;            // 봇 답변 대기 중 타이핑 점 표시(홈페이지 .typing)
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
          {/* 홈페이지 챗봇 아바타(.chat-head .av) 그대로 — 사람 + 스파클 */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 20v-1a6 6 0 0 1 12 0v1" strokeLinecap="round" />
            <circle cx="10" cy="7" r="3.4" />
            <path d="M17 4l1.4 2.8L21 8l-2.6 1.2L17 12l-1.4-2.8L13 8l2.6-1.2Z" fill="currentColor" stroke="none" transform="translate(1,1) scale(.7)" />
          </svg>
        </span>
        <span className="wc-header__title">
          AI 상담봇
          <span className="wc-header__status"><i className="wc-header__dot" aria-hidden="true" />지금 응답 가능</span>
        </span>
      </header>
      {/* 진료과 배너·인계 상태·긴급/장애 안내 — 헤더가 아니라 대화 영역에 둔다(WEBCHAT-GUIDE: 추천 중에만 메시지와 함께). */}
      <div className="wc-status">{p.guideSlot}{p.handoffSlot}{p.urgentSlot}{p.outageSlot}</div>
      {p.phase === 'restoring' && <div className="wc-loading" role="status">불러오는 중…</div>}
      <ul className="wc-body">
        {/* 첫 상담(복원 메시지 0건)이면 빈 오류가 아니라 시작 안내를 대화 안에 표시(WEBCHAT-ROOM-03) — 복원 중·조회 오류엔 감춘다. */}
        {p.messages.length === 0 && p.phase !== 'restoring' && p.phase !== 'loadError' && p.startSlot && (
          <li className="wc-startline">{p.startSlot}</li>
        )}
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
        {p.botTyping && (
          <li className="wc-typing" aria-label="상담봇이 입력 중" aria-live="polite">
            <i /><i /><i />
          </li>
        )}
      </ul>
      {p.phase === 'loadError' && (
        <div className="wc-error">
          <p>대화를 불러오지 못했어요.</p>
          <button type="button" onClick={p.onRetryLoad}>다시 시도</button>
        </div>
      )}
      <div className="wc-foot">
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
