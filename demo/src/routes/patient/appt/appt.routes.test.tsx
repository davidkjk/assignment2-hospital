import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'

test('나의 예약 목록에서 예약 줄을 누르면 상세로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/appointments'])

  expect(screen.getByTestId('my-appointments')).toBeInTheDocument()
  // 예약목록은 홈의 큰 카드가 아니라 '얇은 줄'(LIST-ROLE-02) → appt-row.
  expect(screen.getAllByTestId('appt-row')).toHaveLength(6)

  await user.click(screen.getAllByTestId('appt-row')[0])
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

test('마감 후 예약 취소는 안내 팝업을 거쳐 상담 채팅으로 연결된다', async () => {
  const user = userEvent.setup()
  // appt-2는 오늘 예약 → 마감 후(late). 상세에서 [예약 취소] → 안내 팝업이 뜬다.
  renderApp(routes, ['/appt/appt-2'])

  await user.click(screen.getByRole('button', { name: '예약 취소' }))
  const dialog = screen.getByTestId('appt-cancel-late-dialog')
  expect(dialog).toHaveTextContent('취소 마감 시간이 지났습니다')

  await user.click(screen.getByRole('button', { name: '상담 채팅 연결' }))
  expect(screen.getByTestId('chat-cancel-intro')).toHaveTextContent('예약은 그대로 유지')
})

test('마감 전 예약 취소는 확인창에서 취소합니다를 누르면 취소됨으로 바뀐다', async () => {
  const user = userEvent.setup()
  // appt-4는 이틀 뒤 예약 → 마감 전(pre). 확인창 → [취소합니다] → 같은 상세가 취소됨으로 다시 그려진다.
  renderApp(routes, ['/appt/appt-4'])

  await user.click(screen.getByRole('button', { name: '예약 취소' }))
  const dialog = screen.getByTestId('appt-cancel-confirm-dialog')
  expect(dialog).toHaveTextContent('예약을 취소할까요?')

  await user.click(screen.getByRole('button', { name: '취소합니다' }))
  expect(screen.getByTestId('appt-detail')).toHaveTextContent('취소됨')
  expect(screen.getByTestId('appt-detail')).toHaveTextContent('앱에서 직접 취소했습니다')
  expect(screen.getByRole('button', { name: '새로 예약하기' })).toBeInTheDocument()
})
