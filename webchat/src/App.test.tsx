import { render, screen } from '@testing-library/react';
import App from './App';

afterEach(() => { window.history.replaceState({}, '', '/'); });

test('위젯 셸이 AI 상담봇 이름표를 붙여 렌더된다', () => {
  render(<App />);
  // 환자 노출 이름은 항상 `AI 상담봇`(정본 §0). `챗봇` 글자를 쓰지 않는다.
  expect(screen.getByRole('region', { name: 'AI 상담봇' })).toBeInTheDocument();
  expect(screen.queryByText(/챗봇/)).not.toBeInTheDocument();
});

test('[SP1] ?authmode=login 이면 위젯 대신 로그인 화면을 렌더한다(팝업 진입점)', () => {
  window.history.replaceState({}, '', '/?authmode=login');
  render(<App />);
  expect(screen.getByRole('main', { name: '로그인' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'AI 상담봇' })).not.toBeInTheDocument();
});
