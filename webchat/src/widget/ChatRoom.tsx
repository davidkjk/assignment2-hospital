import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  onTyping?: () => void;          // [CHAT-ROOM-PATIENT-TYPING-01] 입력 중이면 직원에게 "환자 입력 중" 알림(디바운스는 훅)
  onStaffHandoff?: () => void;    // Q5: 가장 최근 봇 답변 밑 [직원에게 연결] 칩 → 익명 인계 폼(WEBANON-HANDOFF)
  onNewChat?: () => void;         // [WEBCHAT-NEW-01] 헤더 '새 상담'(연필) — 지금 대화를 접고 처음부터(막다른 길 방지). 없으면 안 그림.
  onClose?: () => void;           // [WEBCHAT-CLOSE-01] 헤더 '닫기'(×) — 위젯을 접는다(호스트로 setOpen:false). 없으면 안 그림(단독 전체화면 등).
  // interactive = 이 카드가 대화의 마지막 메시지인가(지금 단계). 지난 카드는 읽기 기록으로만 둔다(WEBCARD 지난-단계 잠금).
  renderCard: (payload: Record<string, unknown> | null | undefined, interactive: boolean) => ReactNode;
};

// 말풍선 정렬: 환자=오른쪽 딥틸, 봇/직원=왼쪽 흰카드, 시스템=가운데(ROOM-08)
function bubbleClass(senderType: ThreadMessage['senderType']): string {
  if (senderType === 'patient') return 'wc-msg wc-msg--me';
  if (senderType === 'system') return 'wc-msg wc-msg--system';
  return 'wc-msg wc-msg--bot';
}

export function ChatRoom(p: ChatRoomProps) {
  const [draft, setDraft] = useState('');
  // Q23(Q9 환자앱과 동형): 새 메시지(내·상대)가 오면 그 메시지로 스크롤한다 — 예전엔 스크롤 관리가 없어
  //   답변이 와도 화면이 그대로였다. 마지막 메시지의 상단을 뷰포트 위로 맞춘다(긴 답변을 처음부터 읽게).
  const lastMsgRef = useRef<HTMLLIElement | null>(null);
  const lastId = p.messages.length ? p.messages[p.messages.length - 1].id : null;
  useEffect(() => {
    const el = lastMsgRef.current;
    // scrollIntoView는 실브라우저에만 있다(jsdom 미구현) — 있을 때만 호출해 테스트 환경을 깨지 않는다.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [lastId]);
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
        {/* 헤더 우측 아이콘 클러스터 — 새 상담(연필)·닫기(×). 절제된 단일 컨트롤 그룹. */}
        {(p.onNewChat || p.onClose) && (
          <div className="wc-header__actions">
            {/* [WEBCHAT-NEW-01] 새 상담(연필) — 지금 대화를 접고 처음부터(못 빠져나옴 방지). 확인은 위젯이 인계 활성 시 감싼다. 환자앱 [새 대화](CHAT-ROOM-NEW-01)와 같은 compose 연필. */}
            {p.onNewChat && (
              <button type="button" className="wc-hbtn" onClick={p.onNewChat} aria-label="새 상담" title="새 상담">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              </button>
            )}
            {/* [WEBCHAT-CLOSE-01] 닫기(×) — 위젯을 접는다(호스트로 setOpen:false). 홈페이지가 iframe 패널을 닫는다. */}
            {p.onClose && (
              <button type="button" className="wc-hbtn" onClick={p.onClose} aria-label="닫기" title="닫기">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        )}
      </header>
      {/* 진료과 배너·인계 상태·긴급/장애 안내 — 헤더가 아니라 대화 영역에 둔다(WEBCHAT-GUIDE: 추천 중에만 메시지와 함께). */}
      <div className="wc-status">{p.guideSlot}{p.handoffSlot}{p.urgentSlot}{p.outageSlot}</div>
      {p.phase === 'restoring' && <div className="wc-loading" role="status">불러오는 중…</div>}
      <ul className="wc-body">
        {/* 첫 상담(복원 메시지 0건)이면 빈 오류가 아니라 시작 안내를 대화 안에 표시(WEBCHAT-ROOM-03) — 복원 중·조회 오류엔 감춘다. */}
        {p.messages.length === 0 && p.phase !== 'restoring' && p.phase !== 'loadError' && p.startSlot && (
          <li className="wc-startline">{p.startSlot}</li>
        )}
        {p.messages.map((m, idx) => (
          <li
            key={m.id}
            ref={idx === p.messages.length - 1 ? lastMsgRef : undefined}
            data-send-state={m.sendState ?? 'sent'}
            className={m.messageType === 'card' ? 'wc-cardline' : bubbleClass(m.senderType)}
          >
            {m.messageType === 'card' ? p.renderCard(m.payload, idx === p.messages.length - 1) : m.content}
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
        {/* Q5: 가장 최근 봇 텍스트 답변이면 [직원에게 연결] 칩(막다른 길 금지). no_answer는 카드가 이미
            handoff_chip을 내므로(중복 방지) 마지막이 카드가 아닐 때만. 환자 발화가 마지막(봇 대기)이면 감춘다. */}
        {(() => {
          const last = p.messages[p.messages.length - 1];
          const showStaffChip = !p.botTyping && p.onStaffHandoff &&
            last && last.messageType !== 'card' && last.senderType === 'bot';
          return showStaffChip ? (
            <li className="wc-quick" aria-label="직원 연결">
              <button type="button" className="wc-chip wc-chip--handoff" onClick={p.onStaffHandoff}>직원에게 연결</button>
            </li>
          ) : null;
        })()}
      </ul>
      {p.phase === 'loadError' && (
        <div className="wc-error">
          <p>대화를 불러오지 못했어요.</p>
          <button type="button" onClick={p.onRetryLoad}>다시 시도</button>
        </div>
      )}
      <div className="wc-foot">
        <form className="wc-inputbar" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { p.onSend(draft.trim()); setDraft(''); } }}>
          <input className="wc-input" placeholder="메시지를 입력하세요" value={draft} onChange={(e) => { setDraft(e.target.value); p.onTyping?.(); }} />
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
