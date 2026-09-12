import type { CardProps } from './WebCard';

// ── WEBCARD-CANCELCONF ── CCARD-CANCELCONF 본체(재확인·처리중·실패·409) + 인증 연결 + 마감 후 제외
export function CancelConfirmCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  if (p.after_deadline) return null; // CANCELCONF-03: 마감 후 취소·변경은 웹에 별도 화면·진입을 만들지 않는다
  if (state === '처리중') return <p role="status">취소를 처리하는 중입니다…</p>;
  if (state === '실패') return <div role="alert"><p>취소를 처리하지 못했습니다</p><button type="button" onClick={() => ctx.onExecute('cancel_confirm', p)}>다시 시도</button></div>;
  if (state === '충돌') return <div role="alert"><p>이미 처리된 예약입니다</p></div>;
  return (
    <div>
      <p>{String(p.target_summary)} 예약을 취소할까요?</p>
      <div className="wc-card-actions">
        <button type="button" className="wc-card-btn--ghost" onClick={() => { /* [아니요] */ }}>아니요</button>
        <button type="button" className="wc-card-btn--danger" onClick={() =>
          ctx.isAnonymous ? ctx.onAuthGate({ kind: 'cancel', payload: p }) // CANCELCONF-02: 인증 뒤 최신 대상 재확인, 인증 전 취소 API 호출 없음
                          : ctx.onExecute('cancel_confirm', p)}
        >취소합니다</button>
      </div>
    </div>
  );
}

// ── WEBCARD-CANCELDONE ── 취소 주체·시각 본체 + 웹 복원 + 새 예약 연결(문진 자동 복사 없음)
export function CancelDoneCard({ p, ctx }: CardProps) {
  if (p.load_error) return <div role="alert"><p>취소 결과를 불러오지 못했습니다</p><button type="button">다시 시도</button></div>; // 완료로 가장 안 함
  return (
    <div>
      <p>{String(p.name)} 님의 예약이 취소되었습니다{p.cancelled_by ? ` (${String(p.cancelled_by)})` : ''}</p>
      <p>{String(p.at)}</p>
      {/* 취소 예약 문진은 삭제·자동 복사하지 않고 앱 읽기 전용 경로만 안내(CANCELDONE-01) */}
      <button type="button" onClick={ctx.onRebook}>새로 예약하기</button>
    </div>
  );
}

// ── WEBCARD-CANCELREJ ── 직원 사유·고정 확인·다시 문의 본체 + 익명 SMS 답변 전달
export function CancelRejectCard({ p, ctx }: CardProps) {
  return (
    <div>
      <p>취소 요청이 반려되었습니다</p>
      <p>직원 사유: {String(p.reject_reason ?? '사유 없음')}</p>
      <div className="wc-card-actions">
        <button type="button" onClick={() => { /* [확인] → 정상 예약/QR 복귀 */ }}>확인</button>
        {/* CANCELREJ-03: 같은 예약·사유 문맥으로 상담을 이어가며 "취소 요청 접수/등록"이라 표시하지 않음 */}
        <button type="button" className="wc-card-btn--ghost" onClick={() => ctx.onReconsult(p)}>다시 문의하기</button>
      </div>
    </div>
  );
}
