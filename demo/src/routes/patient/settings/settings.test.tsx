import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '@/test-utils'
import { settingsRoutes } from './routes'

test('이력은 처음 20건을 보여주고 더 보기로 다음 묶음을 이어 붙인다', async () => {
  const user = userEvent.setup()
  renderApp(settingsRoutes, ['/history'])

  expect(screen.getByTestId('history')).toBeInTheDocument()
  expect(screen.getAllByTestId(/history-row-/)).toHaveLength(20)

  await user.click(screen.getByRole('button', { name: '더 보기' }))

  expect(screen.getAllByTestId(/history-row-/)).toHaveLength(25)
  expect(screen.getByText('처음부터 모두 보여드렸습니다')).toBeInTheDocument()
})

test('설정 하위 경로가 폰 프레임 안에 렌더된다', () => {
  renderApp(settingsRoutes, ['/settings'])

  expect(screen.getByTestId('phone-frame')).toBeInTheDocument()
  expect(screen.getByTestId('settings')).toBeInTheDocument()
  expect(screen.getByText('알림 설정')).toBeInTheDocument()
})
