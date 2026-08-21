import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'

test('나의 예약 목록에서 예약 줄을 누르면 상세로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/appointments'])

  expect(screen.getByTestId('my-appointments')).toBeInTheDocument()
  expect(screen.getAllByTestId('appointment-row')).toHaveLength(2)

  await user.click(screen.getAllByTestId('appointment-row')[0])
  expect(screen.getByTestId('appt-detail')).toBeInTheDocument()
  expect(screen.getByText('방문이유')).toBeInTheDocument()
})

test('예약 변경은 전후 확인 후 새 예약 상세로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/appt/appt-2/change'])

  expect(screen.getByTestId('appt-change')).toBeInTheDocument()
  await user.click(screen.getAllByTestId('change-date')[0])
  await user.click(screen.getAllByTestId('change-time')[0])
  expect(screen.getByRole('dialog')).toHaveTextContent('변경 전')

  await user.click(screen.getByRole('button', { name: '변경합니다' }))
  expect(screen.getByTestId('appt-detail')).toBeInTheDocument()
  expect(screen.getByText('예약번호가 새로 발급되었습니다')).toBeInTheDocument()
})

test('취소는 상담 연결 즉시 직원 확인 안내를 보여준다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/appt/appt-2/cancel'])

  await user.click(screen.getByRole('button', { name: '상담 채팅 연결' }))
  expect(screen.getByTestId('appt-cancel')).toHaveTextContent('상담(직원 확인)으로 연결됐어요')
})
