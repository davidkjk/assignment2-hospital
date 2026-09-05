import { screen, waitFor } from '@testing-library/react'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'
import { demoAppointments, initialNotifications } from './mockData'

test('알림함은 목록 진입 시 알림을 읽음 처리하고 카드 갤러리는 10종을 보여준다', async () => {
  renderApp(routes, ['/notifications'])

  expect(screen.getByTestId('notifications')).toBeInTheDocument()
  expect(screen.getAllByTestId('notification-item')).toHaveLength(initialNotifications.length)

  await waitFor(() => {
    expect(screen.getAllByTestId('notification-item').every((item) => item.dataset.read === 'true')).toBe(
      true,
    )
  })

  renderApp(routes, ['/cards'])
  expect(screen.getByTestId('card-gallery')).toBeInTheDocument()
  expect(screen.getAllByTestId(/status-card-/)).toHaveLength(demoAppointments.length)
  expect(screen.getByText('확정되지 않음')).toBeInTheDocument()
})
