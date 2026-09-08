import { useState } from 'react';
import type { CardProps } from './WebCard';

// 예약 앞흐름 카드(WEBCARD-DEPT/DOC/DATE/TARGET/WHY). 탭은 다음 단계를 요청(onNavigate)하고,
// 증상으로 찾기 칩만 onPick(텍스트 전송)으로 department_guide를 유발한다. 선택값은 payload가 누적한다.

// ── WEBCARD-DEPT ── 진료과 버튼 + (선택)증상으로 찾기 칩(하이브리드 ①)
export function DeptSelectCard({ p, ctx }: CardProps) {
  const departments = (p.departments as { id: string; name: string }[]) ?? [];
  const guideChip = p.guide_chip as string | null;
  return (
    <div>
      <ul aria-label="진료과 선택" className="wc-flow-list">
        {departments.map((d) => (
          <li key={d.id}>
            <button type="button" className="wc-card-btn"
              onClick={() => ctx.onNavigate?.({ kind: 'pick_department', payload: { department_id: d.id } })}>{d.name}</button>
          </li>
        ))}
      </ul>
      {guideChip && (
        <button type="button" className="wc-card-btn--ghost"
          onClick={() => ctx.onPick('증상으로 진료과를 찾고 싶어요')}>{guideChip}</button>
      )}
    </div>
  );
}

// ── WEBCARD-DOC ── 담당의 버튼(1명이어도 표시, 결정 ②). 0명이면 막다른 길 금지 안내 + 다른 과 경로.
export function DoctorSelectCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  const doctors = (p.doctors as { id: string; name: string; specialty?: string | null; schedule_summary?: string | null }[]) ?? [];
  if (state === '빈' || doctors.length === 0)
    return (
      <div>
        <p>예약 가능한 의사가 없습니다</p>
        <button type="button" className="wc-card-btn--ghost" onClick={() => ctx.onPick('다른 진료과로 예약할게요')}>다른 진료과 고르기</button>
      </div>
    );
  return (
    <ul aria-label="담당의 선택" className="wc-flow-list">
      {doctors.map((d) => (
        <li key={d.id}>
          <button type="button" className="wc-card-btn"
            onClick={() => ctx.onNavigate?.({ kind: 'pick_doctor', payload: { department_id: p.department_id as string, doctor_id: d.id } })}>
            {d.name}{d.specialty ? ` · ${d.specialty}` : ''}{d.schedule_summary ? ` · ${d.schedule_summary}` : ''}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── WEBCARD-DATE ── 예약 가능 날짜 버튼. 0일이면 다른 담당의 경로.
export function DateSelectCard({ p, ctx }: CardProps) {
  const state = (p.state as string) ?? '정상';
  const dates = (p.dates as { date: string; label: string }[]) ?? [];
  if (state === '빈' || dates.length === 0)
    return (
      <div>
        <p>예약 가능한 날짜가 없습니다</p>
        <button type="button" className="wc-card-btn--ghost" onClick={() => ctx.onPick('다른 의사로 예약할게요')}>다른 담당의 고르기</button>
      </div>
    );
  return (
    <ul aria-label="예약 가능한 날짜" className="wc-flow-list">
      {dates.map((d) => (
        <li key={d.date}>
          <button type="button" className="wc-card-btn"
            onClick={() => ctx.onNavigate?.({ kind: 'pick_date', payload: { department_id: p.department_id as string, doctor_id: p.doctor_id as string, date: d.date } })}>{d.label}</button>
        </li>
      ))}
    </ul>
  );
}

// ── WEBCARD-TARGET ── 로그인 후 대상(본인/가족). 탭 → 방문이유 단계(pick_reason). 앞 선택값 누적.
export function TargetSelectCard({ p, ctx }: CardProps) {
  const targets = (p.targets as { for_patient_id: string; name: string; relation?: string | null }[]) ?? [];
  const base = { department_id: p.department_id, doctor_id: p.doctor_id, slot_id: p.slot_id, slot_at: p.slot_at };
  return (
    <ul aria-label="예약 대상 선택" className="wc-flow-list">
      {targets.map((t) => (
        <li key={t.for_patient_id}>
          <button type="button" className="wc-card-btn"
            onClick={() => ctx.onNavigate?.({ kind: 'pick_reason', payload: { ...base, for_patient_id: t.for_patient_id } })}>
            {t.name}{t.relation ? ` (${t.relation})` : ' (본인)'}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── WEBCARD-WHY ── 방문이유(확인 직전 별도 단계, 선택). 증상 대화로 왔으면 prefill. 최대 100자.
export function ReasonCard({ p, ctx }: CardProps) {
  const [reason, setReason] = useState((p.prefill as string) ?? '');
  const submit = (v: string) => {
    const { prefill: _drop, ...rest } = p as Record<string, unknown>;
    ctx.onNavigate?.({ kind: 'submit_reason', payload: { ...rest, visit_reason: v } });
  };
  return (
    <div className="wc-reason">
      <label>방문 이유 (선택, 최대 100자)
        <input type="text" maxLength={100} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button type="button" className="wc-card-btn" onClick={() => submit(reason)}>다음</button>
      <button type="button" className="wc-card-btn--ghost" onClick={() => submit('')}>건너뛰기</button>
    </div>
  );
}
