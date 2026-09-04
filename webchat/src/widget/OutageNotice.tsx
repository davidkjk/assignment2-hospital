export type OutagePhase = 'idle' | 'submitting' | 'error' | 'done';
export function OutageNotice({ phase, hospitalPhone, onLeaveInquiry, onRetry }:
  { phase: OutagePhase; hospitalPhone: string; onLeaveInquiry: () => void; onRetry: () => void }) {
  if (phase === 'done') return <p className="wc-outage__done">상담(직원 확인)으로 연결됐습니다</p>;
  return (
    <div className="wc-outage" role="alert">
      <p className="wc-outage__lead">상담 답변에 일시적인 문제가 있어요. 예약·진료기록은 그대로 이용할 수 있어요.</p>
      <p className="wc-outage__phone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 3h3l1.5 5-2 1.5c1 2.5 2.5 4 5 5l1.5-2 5 1.5v3c0 2-1 3-3 3C10 20 4 14 4 6c0-2 1-3 3-3Z" />
        </svg>
        {hospitalPhone}
      </p>
      <button type="button" className="wc-outage__action" onClick={onLeaveInquiry} disabled={phase === 'submitting'}>문의 남기기</button>
      {phase === 'error' && (
        <>
          <p className="wc-outage__err">문의를 남기지 못했어요.</p>
          <button type="button" onClick={onRetry}>다시 시도</button>
        </>
      )}
      <p className="wc-outage__secondary" data-role="secondary">더 빠른 예약은 환자 앱에서도 할 수 있어요.</p>
    </div>
  );
}
