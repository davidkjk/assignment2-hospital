import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from './App'
import { renderApp } from './test-utils'

test('홈 경로가 폰 프레임 안에 렌더된다', () => {
  renderApp(routes, ['/home'])
  expect(screen.getByTestId('phone-frame')).toBeInTheDocument()
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})

test('로그인 버튼이 홈으로 보낸다', async () => {
  renderApp(routes, ['/'])
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})

test('홈에 오늘 예약이 보이고 예약 탭으로 마법사에 진입한다', async () => {
  renderApp(routes, ['/home'])
  expect(screen.getAllByText('김순자').length).toBeGreaterThan(0)
  expect(screen.getByText('박말순')).toBeInTheDocument()
  // HOME-SCOPE-02: 예약이 있으면 홈에 예약 버튼이 없다. 진입은 하단 '예약' 탭 → 새 예약하기.
  await userEvent.click(screen.getByRole('button', { name: '예약' }))
  await userEvent.click(screen.getByRole('button', { name: /새 예약하기/ }))
  expect(screen.getByTestId('book-screen')).toBeInTheDocument()
})
