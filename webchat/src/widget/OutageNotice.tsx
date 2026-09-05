export type OutagePhase = 'idle' | 'submitting' | 'error' | 'done';
export function OutageNotice({ phase, hospitalPhone, onLeaveInquiry, onRetry }:
  { phase: OutagePhase; hospitalPhone: string; onLeaveInquiry: () => void; onRetry: () => void }) {
  // 완료 문구는 정본이라 글자 그대로 유지(WEBCHAT-OUTAGE-05) — 접수/등록·AI 복구 완료를 암시하지 않는다.
  if (phase === 'done') return <p className="wc-outage__done">상담(직원 확인)으로 연결됐습니다</p>;
  // 나머지 문구·구성은 목업 101(WEBCHAT-OUTAGE) 정본 글자 그대로(합니다체).
  return (
    <div className="wc-outage" role="alert">
      <h2 className="wc-outage__title">지금은 AI 답변을 드리기 어렵습니다</h2>
      <p className="wc-outage__lead">AI 상담 기능만 일시적으로 사용할 수 없습니다. 병원 운영과 예약·진료기록 전체가 중단된 것은 아닙니다.</p>
      <p className="wc-outage__phone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 3h3l1.5 5-2 1.5c1 2.5 2.5 4 5 5l1.5-2 5 1.5v3c0 2-1 3-3 3C10 20 4 14 4 6c0-2 1-3 3-3Z" />
        </svg>
        <span className="wc-outage__phone-info">
          <b className="wc-outage__phone-num">{hospitalPhone}</b>
          <small className="wc-outage__phone-cap">병원에 바로 전화하기</small>
        </span>
      </p>
      <button type="button" className="wc-outage__action" onClick={onLeaveInquiry} disabled={phase === 'submitting'}>
        {phase === 'submitting' ? '문의 남기는 중' : '문의 남기기'}
      </button>
      {phase === 'error' && (
        <>
          <p className="wc-outage__err">문의를 남기지 못했습니다</p>
          <p className="wc-outage__err-sub">대화 내용은 그대로 있습니다.</p>
          <button type="button" onClick={onRetry}>다시 시도</button>
        </>
      )}
      <p className="wc-outage__secondary" data-role="secondary">예약이 필요하면 병원 앱의 예약 메뉴도 이용할 수 있습니다. 웹의 주 행동으로 앱 예약을 실행하지 않습니다.</p>
    </div>
  );
}
