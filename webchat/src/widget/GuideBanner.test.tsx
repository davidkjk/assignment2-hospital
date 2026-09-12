import { render, screen } from '@testing-library/react';
import { GuideBanner } from './GuideBanner';

test('[WEBCHAT-GUIDE-01] 추천 갈래 진행 중이면 위젯 안에 현재 안내 갈래를 고정 표시(비진단)', () => {
  render(<GuideBanner active={true} text="증상에 맞는 진료과를 안내 중입니다" />);
  const banner = screen.getByRole('note', { name: '진료과 추천 안내' });
  expect(banner).toHaveTextContent('증상에 맞는 진료과를 안내 중입니다');
  expect(banner).not.toHaveTextContent(/진단|처방/); // 앱 CHAT-GUIDE 비진단 원칙
});

test('[WEBCHAT-GUIDE-02] 추천 갈래가 끝나면 배너를 표시하지 않는다 — 상시 의료 경고로 남기지 않음', () => {
  render(<GuideBanner active={false} text="증상에 맞는 진료과를 안내 중입니다" />);
  expect(screen.queryByRole('note', { name: '진료과 추천 안내' })).not.toBeInTheDocument();
});

test('[WEBCHAT-GUIDE-03] 배너는 위젯 셸 안에서 메시지와 함께 스크롤돼도 의미가 유지되게 고정 표시', () => {
  render(<GuideBanner active={true} text="안내 진행 중" />);
  expect(screen.getByRole('note', { name: '진료과 추천 안내' })).toHaveAttribute('data-pinned', 'true');
});
