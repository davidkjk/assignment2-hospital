export type OutagePhase = 'idle' | 'submitting' | 'error' | 'done';
export function OutageNotice({ phase, hospitalPhone, onLeaveInquiry, onRetry }:
  { phase: OutagePhase; hospitalPhone: string; onLeaveInquiry: () => void; onRetry: () => void }) {
  if (phase === 'done') return <p>상담(직원 확인)으로 연결됐습니다</p>;
  return (
    <div role="alert">
      <p>상담 답변에 일시적인 문제가 있어요. 예약·진료기록은 그대로 이용할 수 있어요.</p>
      <p>{hospitalPhone}</p>
      <button type="button" onClick={onLeaveInquiry} disabled={phase === 'submitting'}>문의 남기기</button>
      {phase === 'error' && (
        <>
          <p>문의를 남기지 못했어요.</p>
          <button type="button" onClick={onRetry}>다시 시도</button>
        </>
      )}
      <p data-role="secondary">더 빠른 예약은 환자 앱에서도 할 수 있어요.</p>
    </div>
  );
}
