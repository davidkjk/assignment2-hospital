import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebCard, type CardContext } from './WebCard';

function ctx(over: Partial<CardContext> = {}): CardContext {
  return { isAnonymous: true, onAuthGate: vi.fn(), onExecute: vi.fn(), onPick: vi.fn(),
           onReconsult: vi.fn(), onRebook: vi.fn(), onHandoff: vi.fn(), ...over };
}

test('[WEBCARD-QUICK] FAQ 칩은 문장 그대로 환자 말풍선으로 전송한다', async () => {
  const onPick = vi.fn();
  render(<WebCard payload={{ card_type: 'quick_replies', options: ['진료시간이 어떻게 되나요'], state: '정상' }} ctx={ctx({ onPick })} />);
  await userEvent.click(screen.getByRole('button', { name: '진료시간이 어떻게 되나요' }));
  expect(onPick).toHaveBeenCalledWith('진료시간이 어떻게 되나요');
});

test('[WEBCHAT-NOANS] no_answer 카드의 [직원에게 연결] 칩은 인계 폼을 열고(콜백) 텍스트 전송이 아니다', async () => {
  const onHandoff = vi.fn(); const onPick = vi.fn();
  render(<WebCard payload={{ card_type: 'quick_replies', options: ['진료시간이 어떻게 되나요'], handoff_chip: '직원에게 연결', state: '정상' }}
    ctx={ctx({ onHandoff, onPick })} />);
  await userEvent.click(screen.getByRole('button', { name: '직원에게 연결' }));
  expect(onHandoff).toHaveBeenCalledTimes(1);
  expect(onPick).not.toHaveBeenCalledWith('직원에게 연결'); // 콜백 칩(인계 폼) — 문장 전송 아님
});

test('[WEBCARD-QUICK] handoff_chip이 없으면 인계 칩을 렌더하지 않는다(시작 칩 등)', () => {
  render(<WebCard payload={{ card_type: 'quick_replies', options: ['진료시간이 어떻게 되나요'], state: '정상' }} ctx={ctx()} />);
  expect(screen.queryByRole('button', { name: '직원에게 연결' })).not.toBeInTheDocument();
});
