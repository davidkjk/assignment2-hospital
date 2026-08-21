import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'

test('로그인→홈→예약 8단계→완료 후 홈에 예약이 1건 늘어난다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/'])

  // 로그인 → 홈
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(screen.getAllByTestId('appt-card')).toHaveLength(2)

  // 홈 → 예약 마법사
  await user.click(screen.getByRole('button', { name: /진료 예약하기/ }))

  // 1 대상 → 2 진료과 → 3 의사
  await user.click(screen.getByRole('button', { name: /김순자/ }))
  await user.click(screen.getByRole('button', { name: '내과' }))
  await user.click(screen.getByRole('button', { name: /이정훈/ }))

  // 4 날짜 → 5 시간
  await user.click(screen.getAllByTestId('available-date')[0])
  await user.click(screen.getAllByTestId('time-slot')[0])

  // 6 방문이유(다음) → 7 최종확인(예약하기)
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.click(screen.getByRole('button', { name: '이대로 예약하기' }))

  // 8 완료 → [나중에 할게요]로 홈 복귀 (BOOK-DONE-04: 큰 버튼은 사전문진 작성하기)
  expect(screen.getByTestId('book-done')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '나중에 할게요' }))

  // 홈 예약이 2 → 3건
  expect(screen.getAllByTestId('appt-card')).toHaveLength(3)
})
