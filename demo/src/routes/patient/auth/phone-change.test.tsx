import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'

test('[AUTH-TEL-02] 전화번호 변경 안내문과 확인 절차를 보여준다', () => {
  renderApp(routes, ['/auth/tel-change'])

  expect(screen.getByText('병원에 방문하시거나 전화해 주세요')).toBeInTheDocument()
  expect(
    screen.getByText(
      '본인 확인 후 직원이 등록된 전화번호를 바꿔드립니다. 그동안의 예약과 방문 이력은 그대로 유지됩니다.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText('이름·생년월일')).toBeInTheDocument()
  expect(screen.getByText('최근 방문일·진료받은 과')).toBeInTheDocument()
  expect(screen.getByText('새 번호로 인증번호 발송')).toBeInTheDocument()
})

test('[AUTH-TEL-04] 병원 전화번호로 문의 버튼은 전화 링크다', () => {
  renderApp(routes, ['/auth/tel-change'])

  expect(screen.getByRole('link', { name: '병원 전화번호로 문의' })).toHaveAttribute(
    'href',
    'tel:02-1234-5678',
  )
})

test('[AUTH-TEL-01] 앱에서 번호를 직접 바꾸지 않고 병원 경로만 안내한다', () => {
  renderApp(routes, ['/auth/tel-change'])

  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.getByTestId('phone-change-guide')).toBeInTheDocument()
})

test('[AUTH-LOGIN-08] 로그인 화면의 번호 변경 링크가 안내 화면으로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/app'])

  await user.click(screen.getByRole('button', { name: '전화번호가 바뀌어 로그인할 수 없나요? ›' }))

  expect(screen.getByTestId('phone-change-guide')).toBeInTheDocument()
})
