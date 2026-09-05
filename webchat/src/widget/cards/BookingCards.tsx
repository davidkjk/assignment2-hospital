import type { CardProps } from './WebCard';

// ── WEBCARD-TIME ── CCARD-TIME 본체(정상·0개·조회 중·조회 오류) + 위젯 폭 버튼 + 인증 연결
export function TimeSelectCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  const candidates = (p.candidates as { label: string; slot_at: string }[] | undefined) ?? [];
  if (state === '조회중') return <p role="status">시간을 불러오는 중입니다…</p>;
  if (state === '조회오류') return <div role="alert"><p>시간을 불러오지 못했습니다</p><button type="button">다시 시도</button></div>;
  if (state === '빈' || candidates.length === 0)
    return <div><p>예약 가능한 시간이 없습니다</p><button type="button">다른 날짜 고르기</button></div>; // 막다른 길 금지
  return (
    <ul aria-label="예약 가능한 시간">
      {candidates.map((c) => (
        <li key={c.slot_at}>
          {/* WEBCARD-TIME-03: 선택만으로 슬롯 선점·예약하지 않고, 문맥 유지한 채 인증 관문으로 */}
          <button type="button" onClick={() => ctx.onAuthGate({ kind: 'book', payload: { ...p, slot_at: c.slot_at } })}>{c.label}</button>
        </li>
      ))}
    </ul>
  );
}

// ── WEBCARD-BOOKCONF ── 여섯 확인 항목 한 묶음 + [예약 신청하기] 본체 + 인증 전 관문/인증 후 재확인
export function BookConfirmCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  const button = (p.button as string) ?? '예약 신청하기';
  if (state === '처리중') return <p role="status">예약을 신청하는 중입니다…</p>;             // CCARD-BOOKCONF 처리 중
  if (state === '실패') return <div role="alert"><p>예약을 신청하지 못했습니다</p><button type="button" onClick={() => ctx.onExecute('booking_confirm', p)}>다시 시도</button></div>;
  if (state === '충돌') return <div role="alert"><p>방금 다른 분이 먼저 예약했습니다. 시간을 다시 골라 주세요</p></div>; // 409
  const items: [string, unknown][] = [
    ['받는 분', p.patient_name], ['진료과', p.department_name], ['담당의', p.doctor_name],
    ['일시', p.slot_at], ['방문 이유', p.visit_reason ?? '—'], ['장소', p.place ?? '—'],
  ];
  return (
    <div>
      <dl role="group" aria-label="예약 확인">{items.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>))}</dl>
      <button type="button" onClick={() =>
        ctx.isAnonymous ? ctx.onAuthGate({ kind: 'book', payload: p })  // WEBCARD-BOOKCONF-02: 인증 전 관문·선택값 유지
                        : ctx.onExecute('booking_confirm', p)}          // BOOKCONF-01/03: [신청] 눌러야 확정(자동 아님)
      >{button}</button>
    </div>
  );
}

// ── WEBCARD-BOOKDONE ── 신청/확정 구분 + 번호 + 문진은 앱 안내만 + 재실행 금지
export function BookDoneCard({ p }: CardProps) {
  const qNote = p.questionnaire_note as string | null;
  const qButton = p.questionnaire_button as string | null;
  return (
    <div>
      <p>{String(p.headline)}</p>
      <p>{String(p.number_label)} {String(p.number)}</p>
      {qNote && <p>{qNote}</p>}  {/* 0문항: "작성할 문진이 없습니다" — 버튼 없음 */}
      {qButton && <p>사전문진은 환자 앱에서 작성하거나 수정할 수 있습니다</p>} {/* 웹은 문진 안 엶 */}
      {/* WEBCARD-BOOKDONE-03: 완료 카드는 읽기 기록 — 예약 신청 버튼을 다시 실행 가능하게 두지 않는다 */}
    </div>
  );
}
