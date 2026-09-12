import type { HandoffStatus } from '../api/webchatApi';

// Q18④ 상태 라벨(환자 관점). connecting=배정돼도 '확인 전'(Q18② 배정 숨김) / inProgress=실제 열람 presence(별도
// realtime, 이번 범위 밖이지만 라벨은 미리) / answered=직원 이름·역할로 대신 표시.
const LABEL: Record<'connecting' | 'inProgress' | 'typing' | 'answered', string> = {
  connecting: '직원 확인 전이에요', inProgress: '직원이 확인 중이에요',
  typing: '직원이 입력 중이에요', answered: '답변 도착',
};
// 환자 노출 문구는 이것만 — 접수/등록·시간 약속 금지(정본 §0, Q18).
const CONNECTING_MSG = '상담(직원 확인)으로 연결됐어요. 순서대로 확인해 답변드려요. 시간이 걸릴 수 있어요.';

export function HandoffBadge({ status, staffViewing = false, staffTyping = false, onRetry }: { status: HandoffStatus; staffViewing?: boolean; staffTyping?: boolean; onRetry: () => void }) {
  if (status.loadError) {
    return (
      <div className="wc-handoff wc-handoff--error">
        <p>상태를 불러오지 못했어요.</p>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }
  if (status.phase === null) return <div className="wc-handoff wc-handoff--loading" role="status">상태 확인 중…</div>;
  const everAnswered = status.phase === 'answered';
  // CHAT-HANDOFF-STATE-03: 직원이 [상담 종료]하면(closed) 같은 answered라도 '상담 종료'다 — 대화가 끝났으니
  //   담당자 이름·연결 안내를 더 붙이지 않는다(이어서 물으면 새 AI 세션이 시작된다). 종료가 최우선이라
  //   라이브 신호(입력 중)도 덮지 않는다.
  const isClosed = everAnswered && status.closed === true;
  // 색 계열(className): 종료=closed / 답 왔으면 answered 고정(색 튐 방지) / 아직이면 라이브 신호로 올린다.
  const phaseClass = isClosed ? 'closed'
    : everAnswered ? 'answered'
    : staffTyping ? 'typing'
    : status.phase === 'connecting' && staffViewing ? 'inProgress'
    : status.phase;
  // [G2·WEBCHAT-STAFF-TYPING-02] 라벨 우선순위: 종료 > 직원 입력 중(라이브) > 답변 도착 > 확인 중 > 확인 전.
  //   예전엔 answered면 라이브 신호를 무시해 '답변 도착'에 고착됐다(직원이 다음 답을 쓰는 중이어도 그대로).
  //   이제 answered 뒤에도 직원이 다시 입력하면 '직원이 입력 중'으로 올리고, 멈추면 '답변 도착'으로 복귀한다
  //   (typing은 broadcast라 놓쳐도 안전 타임아웃으로 자동 해제 — useStaffPresence). 색은 answered 유지.
  const label = isClosed ? '상담 종료'
    : staffTyping ? LABEL.typing
    : everAnswered ? LABEL.answered
    : phaseClass === 'inProgress' ? LABEL.inProgress
    : LABEL.connecting;
  return (
    <div className={`wc-handoff wc-handoff--${phaseClass}`}>
      <span className="wc-handoff__badge">{label}</span>
      {!isClosed && status.assigneeName && <span className="wc-handoff__who">{status.assigneeName} {status.assigneeRole}</span>}
      {status.hoursNote && <p className="wc-handoff__hours">{status.hoursNote}</p>}
      {/* 답변 도착 전에만 연결 안내(시간 약속 없음). 답이 온 뒤엔 담당자 이름·역할이 대신한다. */}
      {!everAnswered && <p className="wc-handoff__msg">{CONNECTING_MSG}</p>}
    </div>
  );
}
