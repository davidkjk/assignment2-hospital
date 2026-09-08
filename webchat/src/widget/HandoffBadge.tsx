import type { HandoffStatus } from '../api/webchatApi';

// Q18④ 상태 라벨(환자 관점). connecting=배정돼도 '확인 전'(Q18② 배정 숨김) / inProgress=실제 열람 presence(별도
// realtime, 이번 범위 밖이지만 라벨은 미리) / answered=직원 이름·역할로 대신 표시.
const LABEL: Record<'connecting' | 'inProgress' | 'answered', string> = {
  connecting: '직원 확인 전이에요', inProgress: '직원이 확인 중이에요', answered: '답변 도착',
};
// 환자 노출 문구는 이것만 — 접수/등록·시간 약속 금지(정본 §0, Q18).
const CONNECTING_MSG = '상담(직원 확인)으로 연결됐어요. 순서대로 확인해 답변드려요. 시간이 걸릴 수 있어요.';

export function HandoffBadge({ status, staffViewing = false, onRetry }: { status: HandoffStatus; staffViewing?: boolean; onRetry: () => void }) {
  if (status.loadError) {
    return (
      <div className="wc-handoff wc-handoff--error">
        <p>상태를 불러오지 못했어요.</p>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }
  if (status.phase === null) return <div className="wc-handoff wc-handoff--loading" role="status">상태 확인 중…</div>;
  // Q18③: connecting(직원 확인 전)에 실제 열람 presence가 겹치면 "직원이 확인 중"으로 올린다.
  // answered(답변 도착)는 열람 여부로 되돌리지 않는다(이미 답이 왔다).
  const phase = status.phase === 'connecting' && staffViewing ? 'inProgress' : status.phase;
  const isAnswered = phase === 'answered';
  return (
    <div className={`wc-handoff wc-handoff--${phase}`}>
      <span className="wc-handoff__badge">{LABEL[phase]}</span>
      {status.assigneeName && <span className="wc-handoff__who">{status.assigneeName} {status.assigneeRole}</span>}
      {status.hoursNote && <p className="wc-handoff__hours">{status.hoursNote}</p>}
      {/* 답변 도착이면 직원 이름·역할이 안내를 대신하고, 그 전엔 연결 안내만(시간 약속 없음). */}
      {!isAnswered && <p className="wc-handoff__msg">{CONNECTING_MSG}</p>}
    </div>
  );
}
