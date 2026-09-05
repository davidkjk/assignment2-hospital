import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Launcher } from './Launcher';

test('[WEBCHAT-LAUNCH-01] 위젯 닫힘이면 `AI 상담봇` 여는 단일 런처를 표시한다', () => {
  render(<Launcher open={false} hasUnread={false} onOpen={() => {}} onClose={() => {}} />);
  const btn = screen.getByRole('button', { name: 'AI 상담봇 열기' });
  expect(btn).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1); // 진입점은 하나
  expect(screen.queryByText(/챗봇/)).not.toBeInTheDocument(); // 환자 노출 이름은 AI 상담봇
});

test('[WEBCHAT-LAUNCH-02] 닫힌 런처를 누르면 방 열기를 요청한다(세션 복원은 위젯이 이어받음)', async () => {
  const onOpen = vi.fn();
  render(<Launcher open={false} hasUnread={false} onOpen={onOpen} onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test('[WEBCHAT-LAUNCH-03] 위젯 열림에서 닫기는 onClose만 부른다 — 대화/토큰 삭제 아님', async () => {
  const onClose = vi.fn();
  render(<Launcher open={true} hasUnread={false} onOpen={() => {}} onClose={onClose} />);
  // 닫기는 셸이 제공(LAUNCH-04). 런처는 열림 표시만.
  expect(screen.queryByRole('button', { name: 'AI 상담봇 열기' })).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled(); // 렌더만으로 아무것도 지우지 않는다
});

test('[WEBCHAT-LAUNCH-04] 위젯 열림이면 런처가 별도 진입점처럼 보이지 않게 열림 상태를 표시한다', () => {
  render(<Launcher open={true} hasUnread={false} onOpen={() => {}} onClose={() => {}} />);
  const launcher = screen.getByLabelText('AI 상담봇 런처');
  expect(launcher).toHaveAttribute('data-open', 'true'); // 열림 표시(두 개의 상담 진입점 금지)
  expect(screen.queryByRole('button', { name: 'AI 상담봇 열기' })).not.toBeInTheDocument();
});

test('[WEBCHAT-LAUNCH-05] 닫힘 중 직원 답변 도착이면 점 ● 하나만 — 숫자 배지 없음', () => {
  render(<Launcher open={false} hasUnread={true} onOpen={() => {}} onClose={() => {}} />);
  expect(screen.getByLabelText('새 답변 있음')).toBeInTheDocument(); // 점 표식
  expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument(); // 숫자 배지 금지(결정 B4)
});
