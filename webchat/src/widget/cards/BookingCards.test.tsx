import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebCard, type CardContext } from './WebCard';

function ctx(over: Partial<CardContext> = {}): CardContext {
  return { isAnonymous: true, onAuthGate: vi.fn(), onExecute: vi.fn(), onPick: vi.fn(), onReconsult: vi.fn(), onRebook: vi.fn(), ...over };
}

test('[WEBCARD-TIME-01] CCARD-TIME 본체 상태(빈·조회중·조회오류)를 그대로 따른다', () => {
  const { rerender } = render(<WebCard payload={{ card_type: 'time_select', state: '빈', candidates: [] }} ctx={ctx()} />);
  expect(screen.getByText('예약 가능한 시간이 없습니다')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다른 날짜 고르기' })).toBeInTheDocument();
  rerender(<WebCard payload={{ card_type: 'time_select', state: '조회오류' }} ctx={ctx()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('시간을 불러오지 못했습니다');
});

test('[WEBCARD-TIME-02] 날짜·시간을 긴 대화문이 아니라 위젯 폭 버튼으로 표시한다', () => {
  render(<WebCard payload={{ card_type: 'time_select', state: '정상', candidates: [{ label: '오전 10:00', slot_at: 's1' }, { label: '오전 10:30', slot_at: 's2' }] }} ctx={ctx()} />);
  const list = screen.getByRole('list', { name: '예약 가능한 시간' });
  expect(list.querySelectorAll('button')).toHaveLength(2); // 버튼 격자
});

test('[WEBCARD-TIME-03] 시간 선택은 슬롯을 선점·예약하지 않고 문맥을 유지한 채 인증 관문으로 보낸다', async () => {
  const onAuthGate = vi.fn(); const onExecute = vi.fn();
  render(<WebCard payload={{ card_type: 'time_select', state: '정상', candidates: [{ label: '오전 10:00', slot_at: 's1' }] }} ctx={ctx({ onAuthGate, onExecute })} />);
  await userEvent.click(screen.getByRole('button', { name: '오전 10:00' }));
  expect(onAuthGate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'book', payload: expect.objectContaining({ slot_at: 's1' }) }));
  expect(onExecute).not.toHaveBeenCalled(); // 선택만으로 예약 없음
});

const confirmPayload = { card_type: 'booking_confirm', patient_name: '홍길동', department_name: '내과', doctor_name: '김의사', slot_at: '2026-08-20T10:00', visit_reason: '두통', button: '예약 신청하기', state: '정상' };

test('[WEBCARD-BOOKCONF-01] 확인 항목과 [예약 신청하기] 버튼·처리중/실패/충돌 상태를 본체 계약대로 따른다', () => {
  const { rerender } = render(<WebCard payload={confirmPayload} ctx={ctx({ isAnonymous: false })} />);
  expect(screen.getByRole('button', { name: '예약 신청하기' })).toBeInTheDocument();
  rerender(<WebCard payload={{ ...confirmPayload, state: '충돌' }} ctx={ctx({ isAnonymous: false })} />);
  expect(screen.getByRole('alert')).toHaveTextContent('먼저 예약했습니다');
});

test('[WEBCARD-BOOKCONF-02] 익명 세션이면 예약 실행 전에 WEBMOD-AUTH를 열고 선택값을 유지한다', async () => {
  const onAuthGate = vi.fn(); const onExecute = vi.fn();
  render(<WebCard payload={confirmPayload} ctx={ctx({ isAnonymous: true, onAuthGate, onExecute })} />);
  await userEvent.click(screen.getByRole('button', { name: '예약 신청하기' }));
  expect(onAuthGate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'book' }));
  expect(onExecute).not.toHaveBeenCalled(); // 인증 전 예약 API 호출 없음
});

test('[WEBCARD-BOOKCONF-03] 인증 완료 후 재확인 카드는 [신청]을 눌러야 확정하며 렌더만으로 자동 실행하지 않는다', async () => {
  const onExecute = vi.fn();
  render(<WebCard payload={confirmPayload} ctx={ctx({ isAnonymous: false, onExecute })} />); // 인증됨 = 재확인 카드
  expect(onExecute).not.toHaveBeenCalled();                          // 렌더만으로 자동 신청 없음
  await userEvent.click(screen.getByRole('button', { name: '예약 신청하기' }));
  expect(onExecute).toHaveBeenCalledWith('booking_confirm', confirmPayload); // 눌러야 확정
});

test('[WEBCARD-BOOKCONF-04] 여섯 확인 항목과 주 행동을 위젯 폭 안에서 한 묶음으로 유지한다', () => {
  render(<WebCard payload={confirmPayload} ctx={ctx({ isAnonymous: false })} />);
  const dl = screen.getByRole('group', { name: '예약 확인' });
  expect(within(dl).getAllByRole('term')).toHaveLength(6);
});

test('[WEBCARD-BOOKDONE-01] 신청/확정 구분과 번호를 본체 계약대로 표시한다', () => {
  render(<WebCard payload={{ card_type: 'booking_done', headline: '예약이 신청되었습니다', number_label: '신청번호', number: 'A-12' }} ctx={ctx()} />);
  expect(screen.getByText('예약이 신청되었습니다')).toBeInTheDocument();
  expect(screen.getByText(/신청번호 A-12/)).toBeInTheDocument();
});

test('[WEBCARD-BOOKDONE-02] 문진은 웹에서 열지 않고 앱 경로만 안내하며 0문항은 "작성할 문진이 없습니다"만 표시한다', () => {
  const { rerender } = render(<WebCard payload={{ card_type: 'booking_done', headline: '예약이 신청되었습니다', number_label: '신청번호', number: 'A-12', questionnaire_button: '사전문진 작성하기' }} ctx={ctx()} />);
  expect(screen.getByText(/환자 앱에서 작성하거나 수정/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /문진/ })).not.toBeInTheDocument(); // 웹에서 문진 안 엶
  rerender(<WebCard payload={{ card_type: 'booking_done', headline: '예약이 확정되었습니다', number_label: '예약번호', number: 'A-12', questionnaire_note: '작성할 문진이 없습니다' }} ctx={ctx()} />);
  expect(screen.getByText('작성할 문진이 없습니다')).toBeInTheDocument();
  expect(screen.queryByText('(0/0)')).not.toBeInTheDocument();
});

test('[WEBCARD-BOOKDONE-03] 완료 카드는 예약 신청 버튼을 다시 실행 가능하게 두지 않는다', () => {
  render(<WebCard payload={{ card_type: 'booking_done', headline: '예약이 신청되었습니다', number_label: '신청번호', number: 'A-12' }} ctx={ctx()} />);
  expect(screen.queryByRole('button', { name: '예약 신청하기' })).not.toBeInTheDocument();
});
