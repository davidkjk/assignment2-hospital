import type { HandoffStatus } from '../api/webchatApi';

const LABEL: Record<'connecting' | 'inProgress' | 'answered', string> = {
  connecting: '대기중', inProgress: '직원 확인중', answered: '답변완료',
};

export function HandoffBadge({ status, onRetry }: { status: HandoffStatus; onRetry: () => void }) {
  if (status.loadError) {
    return (
      <div className="wc-handoff wc-handoff--error">
        <p>상태를 불러오지 못했어요.</p>
        <button type="button" onClick={onRetry}>다시 시도</button>
      </div>
    );
  }
  if (status.phase === null) return <div className="wc-handoff wc-handoff--loading" role="status">상태 확인 중…</div>;
  return (
    <div className={`wc-handoff wc-handoff--${status.phase}`}>
      <span className="wc-handoff__badge">{LABEL[status.phase]}</span>
      {status.assigneeName && <span className="wc-handoff__who">{status.assigneeName} {status.assigneeRole}</span>}
      {status.hoursNote && <p className="wc-handoff__hours">{status.hoursNote}</p>}
      <p className="wc-handoff__msg">상담(직원 확인)으로 연결됐습니다</p>
    </div>
  );
}
