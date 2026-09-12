import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebCard, type CardContext } from './WebCard';

function ctx(over: Partial<CardContext> = {}): CardContext {
  return {
    isAnonymous: true, onAuthGate: vi.fn(), onExecute: vi.fn(), onPick: vi.fn(),
    onReconsult: vi.fn(), onRebook: vi.fn(), onNavigate: vi.fn(), ...over,
  };
}

test('[WEBCARD-DEPT-01] 진료과 버튼 + 증상으로 찾기 칩을 표시한다', () => {
  render(<WebCard payload={{ card_type: 'department_select', departments: [{ id: 'd1', name: '내과' }], guide_chip: '잘 모르겠어요 · 증상으로 찾기' }} ctx={ctx()} />);
  expect(screen.getByRole('button', { name: '내과' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '잘 모르겠어요 · 증상으로 찾기' })).toBeInTheDocument();
});

test('[WEBCARD-DEPT-03] 진료과 탭 → onNavigate(pick_department)', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'department_select', departments: [{ id: 'd1', name: '내과' }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: '내과' }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_department', payload: { department_id: 'd1' } });
});

test('[WEBCARD-DEPT-04] 증상으로 찾기 칩 → onPick(증상 문장)으로 department_guide 유발', async () => {
  const onPick = vi.fn();
  render(<WebCard payload={{ card_type: 'department_select', departments: [], guide_chip: '잘 모르겠어요 · 증상으로 찾기' }} ctx={ctx({ onPick })} />);
  await userEvent.click(screen.getByRole('button', { name: '잘 모르겠어요 · 증상으로 찾기' }));
  expect(onPick).toHaveBeenCalledWith(expect.stringContaining('증상'));
});

test('[WEBCARD-DOC-02] 가용 의사 0 → 막다른 길 금지 안내 + 다른 과 경로', () => {
  render(<WebCard payload={{ card_type: 'doctor_select', state: '빈', doctors: [], department_name: '내과' }} ctx={ctx()} />);
  expect(screen.getByText(/예약 가능한 의사가 없습니다/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /다른 진료과/ })).toBeInTheDocument();
});

test('[WEBCARD-DOC-01] 의사 1명이어도 표시하고 탭 → onNavigate(pick_doctor)', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'doctor_select', state: '정상', department_id: 'd1', department_name: '내과', doctors: [{ id: 's1', name: '김의사', specialty: '소화기', schedule_summary: '월·수·금' }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: /김의사/ }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_doctor', payload: { department_id: 'd1', doctor_id: 's1' } });
});

test('[WEBCARD-DATE-01] 날짜 탭 → onNavigate(pick_date)', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'date_select', state: '정상', department_id: 'd1', doctor_id: 's1', dates: [{ date: '2026-09-11', label: '9월 11일 (수)' }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: '9월 11일 (수)' }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_date', payload: { department_id: 'd1', doctor_id: 's1', date: '2026-09-11' } });
});

test('[WEBCARD-DATE-02] 가용일 0 → 다른 담당의 경로', () => {
  render(<WebCard payload={{ card_type: 'date_select', state: '빈', department_id: 'd1', doctor_id: 's1', dates: [] }} ctx={ctx()} />);
  expect(screen.getByText(/예약 가능한 날짜가 없습니다/)).toBeInTheDocument();
});

test('[WEBCARD-TARGET-01] 대상 탭 → onNavigate(pick_reason)로 방문이유 단계', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'target_select', state: '정상', department_id: 'd1', doctor_id: 's1', slot_id: 'sl1', slot_at: '2026-09-11T10:00:00', targets: [{ for_patient_id: 'p1', name: '홍길동', relation: null }] }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: /홍길동/ }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'pick_reason', payload: expect.objectContaining({ for_patient_id: 'p1', slot_id: 'sl1' }) });
});

test('[WEBCARD-WHY-01] 방문이유 카드 [건너뛰기] → 빈 사유로 submit_reason', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'reason_input', department_id: 'd1', doctor_id: 's1', slot_id: 'sl1', slot_at: '2026-09-11T10:00:00', for_patient_id: 'p1' }} ctx={ctx({ onNavigate })} />);
  await userEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'submit_reason', payload: expect.objectContaining({ for_patient_id: 'p1', visit_reason: '' }) });
});

test('[WEBCARD-WHY-01] 방문이유 입력 후 [다음] → 사유 담아 submit_reason', async () => {
  const onNavigate = vi.fn();
  render(<WebCard payload={{ card_type: 'reason_input', for_patient_id: 'p1', slot_id: 'sl1' }} ctx={ctx({ onNavigate })} />);
  await userEvent.type(screen.getByLabelText(/방문 이유/), '두통');
  await userEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(onNavigate).toHaveBeenCalledWith({ kind: 'submit_reason', payload: expect.objectContaining({ visit_reason: '두통' }) });
});
