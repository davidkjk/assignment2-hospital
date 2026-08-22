import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'

test('로그인→홈→예약 8단계→완료 후 나의 예약 목록에 1건 늘어난다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/'])

  // 로그인 → (전화번호·비밀번호 화면) → 홈 (홈은 오늘치 3건, HOME-SCOPE)
  await user.click(screen.getByRole('button', { name: '로그인' })) // 랜딩
  await user.click(screen.getByRole('button', { name: '로그인' })) // 로그인 화면 제출
  expect(screen.getAllByTestId(/status-card-/)).toHaveLength(3)

  // 홈 → 예약 탭 → 새 예약하기 (HOME-SCOPE-02: 홈엔 예약 버튼 없음, 진입은 '예약' 탭)
  await user.click(screen.getByRole('button', { name: '예약' }))
  await user.click(screen.getByRole('button', { name: /새 예약하기/ }))

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
  expect(screen.getAllByTestId(/status-card-/)).toHaveLength(3)
})
