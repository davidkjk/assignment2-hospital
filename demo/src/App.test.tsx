import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from './App'
import { renderApp } from './test-utils'

test('홈 경로가 폰 프레임 안에 렌더된다', () => {
  renderApp(routes, ['/home'])
  expect(screen.getByTestId('phone-frame')).toBeInTheDocument()
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})

test('로그인 버튼이 로그인 화면을 거쳐 홈으로 보낸다', async () => {
  renderApp(routes, ['/'])
  // 랜딩 [로그인] → 전화번호·비밀번호 입력 화면(AUTH-LOGIN)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
  expect(screen.getByTestId('login-form')).toBeInTheDocument()
  // 로그인 화면 제출 → 홈(AUTH-LOGIN-09, 데모라 실제 인증 없음)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})

test('홈에 오늘 예약이 보이고 예약 탭으로 마법사에 진입한다', async () => {
  renderApp(routes, ['/home'])
  // 정본 카드는 이름·관계를 한 줄에 쓴다("김순자 · 본인") → 부분일치로 찾는다.
  expect(screen.getAllByText(/김순자/).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/박말순/).length).toBeGreaterThan(0)
  // HOME-SCOPE-02: 예약이 있으면 홈에 예약 버튼이 없다. 진입은 하단 '예약' 탭 → 새 예약하기.
  await userEvent.click(screen.getByRole('button', { name: '예약' }))
  await userEvent.click(screen.getByRole('button', { name: /새 예약하기/ }))
  expect(screen.getByTestId('book-screen')).toBeInTheDocument()
})
