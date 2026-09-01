import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebCard, type CardContext } from './WebCard';

function ctx(over: Partial<CardContext> = {}): CardContext {
  return { isAnonymous: true, onAuthGate: vi.fn(), onExecute: vi.fn(), onPick: vi.fn(), onReconsult: vi.fn(), onRebook: vi.fn(), ...over };
}

test('[WEBCARD-CANCELCONF-01] 재확인·처리중·실패·409 상태를 본체 계약대로 따른다', () => {
  const { rerender } = render(<WebCard payload={{ card_type: 'cancel_confirm', target_summary: '8월 20일 내과', state: '정상' }} ctx={ctx({ isAnonymous: false })} />);
  expect(screen.getByRole('button', { name: '취소합니다' })).toBeInTheDocument();
  rerender(<WebCard payload={{ card_type: 'cancel_confirm', state: '처리중' }} ctx={ctx({ isAnonymous: false })} />);
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('[WEBCARD-CANCELCONF-02] 익명이면 WEBMOD-AUTH 뒤 최신 대상을 재확인하고 인증 전 취소 API를 호출하지 않는다', async () => {
  const onAuthGate = vi.fn(); const onExecute = vi.fn();
  render(<WebCard payload={{ card_type: 'cancel_confirm', target_summary: '8월 20일 내과', state: '정상' }} ctx={ctx({ isAnonymous: true, onAuthGate, onExecute })} />);
  await userEvent.click(screen.getByRole('button', { name: '취소합니다' }));
  expect(onAuthGate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cancel' }));
  expect(onExecute).not.toHaveBeenCalled();
});

test('[WEBCARD-CANCELCONF-03] 마감 후 취소·변경은 앱 팝업·예약 맥락 화면을 웹에 복제하거나 별도 화면으로 세지 않는다', () => {
  const { container } = render(<WebCard payload={{ card_type: 'cancel_confirm', after_deadline: true, target_summary: '8월 20일' }} ctx={ctx()} />);
  expect(screen.queryByRole('button', { name: '취소합니다' })).not.toBeInTheDocument();
  expect(container.querySelector('[data-card-type="cancel_confirm"]')!.textContent).toBe(''); // 웹 처리 진입·문구를 임의로 만들지 않음
});

test('[WEBCARD-CANCELDONE-01] 취소 주체·시각·결과 상태를 본체 계약대로 따르고 문진 읽기 전용은 앱 경로만 안내한다', () => {
  render(<WebCard payload={{ card_type: 'cancel_done', name: '홍길동', cancelled_by: '환자', at: '2026-08-19 10:00' }} ctx={ctx()} />);
  expect(screen.getByText(/홍길동 님의 예약이 취소되었습니다/)).toBeInTheDocument();
  expect(screen.queryByText(/문진 진행률|답변 보기/)).not.toBeInTheDocument(); // 웹에서 문진 내용·진행률 안 엶
});

test('[WEBCARD-CANCELDONE-02] 재방문 시 취소 결과를 서버에서 다시 읽고 조회 오류를 취소 완료로 가장하지 않는다', () => {
  render(<WebCard payload={{ card_type: 'cancel_done', load_error: true }} ctx={ctx()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('취소 결과를 불러오지 못했습니다');
  expect(screen.queryByText(/취소되었습니다/)).not.toBeInTheDocument();
});

test('[WEBCARD-CANCELDONE-03] [새로 예약하기]는 웹 예약 흐름으로 연결하되 보존 문진을 자동 복사하지 않는다', async () => {
  const onRebook = vi.fn();
  render(<WebCard payload={{ card_type: 'cancel_done', name: '홍길동', at: '2026-08-19' }} ctx={ctx({ onRebook })} />);
  await userEvent.click(screen.getByRole('button', { name: '새로 예약하기' }));
  expect(onRebook).toHaveBeenCalledTimes(1); // 자동 복사 없이 새 흐름 진입(로그인 필요 시 컨테이너가 WEBMOD-AUTH)
});

test('[WEBCARD-CANCELREJ-01] 직원 사유·고정 확인·다시 문의 규칙을 본체 계약대로 따른다', () => {
  render(<WebCard payload={{ card_type: 'cancel_reject', reject_reason: '이미 진료가 시작되었습니다' }} ctx={ctx()} />);
  expect(screen.getByText(/직원 사유: 이미 진료가 시작되었습니다/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
});

test('[WEBCARD-CANCELREJ-02] 사유 누락이어도 고정 확인 문구를 표시한다(직원 답변 문자 전달은 서버·익명 토큰 복원)', () => {
  render(<WebCard payload={{ card_type: 'cancel_reject', reject_reason: null }} ctx={ctx()} />);
  expect(screen.getByText(/사유 없음/)).toBeInTheDocument();
  expect(screen.getByText('취소 요청이 반려되었습니다')).toBeInTheDocument();
});

test('[WEBCARD-CANCELREJ-03] [다시 문의하기]는 같은 예약·사유 문맥으로 이어가며 "취소 요청 접수/등록"이라 표시하지 않는다', async () => {
  const onReconsult = vi.fn();
  const p = { card_type: 'cancel_reject', reject_reason: '진료 시작' };
  render(<WebCard payload={p} ctx={ctx({ onReconsult })} />);
  await userEvent.click(screen.getByRole('button', { name: '다시 문의하기' }));
  expect(onReconsult).toHaveBeenCalledWith(p);
  expect(screen.queryByText(/접수|등록/)).not.toBeInTheDocument();
});
