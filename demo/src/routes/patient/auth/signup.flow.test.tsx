import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'

async function openPhoneStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '필수 항목에 모두 동의' }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

async function openOtpStep(user: ReturnType<typeof userEvent.setup>) {
  await openPhoneStep(user)
  await user.type(screen.getByRole('textbox', { name: '전화번호' }), '010-1234-5678')
  await user.click(screen.getByRole('button', { name: '인증번호 받기' }))
}

async function openProfileStep(user: ReturnType<typeof userEvent.setup>) {
  await openOtpStep(user)
  const digits = screen.getAllByTestId('otp-digit')
  for (const [index, input] of digits.entries()) await user.type(input, String(index + 1))
}

test('[AUTH-SIGNUP-03] 회원가입은 점 네 개와 1단계 진행 표시를 보여준다', () => {
  renderApp(routes, ['/signup'])

  expect(screen.getAllByTestId('signup-progress-dot')).toHaveLength(4)
  expect(screen.getByText('1단계 / 4단계')).toBeInTheDocument()
})

test('[CONSENT-ITEM-01] 동의 화면은 필수 세 줄과 선택 광고 한 줄을 보여준다', () => {
  renderApp(routes, ['/signup'])

  expect(screen.getByText('[필수] 서비스 이용약관')).toBeInTheDocument()
  expect(screen.getByText('[필수] 개인정보 수집·이용')).toBeInTheDocument()
  expect(screen.getByText('[필수] 민감정보(건강정보) 처리')).toBeInTheDocument()
  expect(screen.getByText('[선택] 광고성 정보 수신')).toBeInTheDocument()
  expect(screen.getByText('이름 · 생년월일 · 성별 · 전화번호')).toBeInTheDocument()
  expect(screen.getByText('문진 답변 · 진료기록 · 처방')).toBeInTheDocument()
  expect(screen.getByText('안 받아도 예약 알림은 그대로 옵니다')).toBeInTheDocument()
})

test('[CONSENT-ALL-01] 필수 항목에 모두 동의는 필수 세 개만 켠다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])

  await user.click(screen.getByRole('button', { name: '필수 항목에 모두 동의' }))

  expect(screen.getByRole('checkbox', { name: /서비스 이용약관/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /개인정보 수집·이용/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /민감정보\(건강정보\) 처리/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /광고성 정보 수신/ })).not.toBeChecked()
})

test('[CONSENT-BTN-02] 필수 동의가 부족하면 다음은 꺼지고 남은 개수를 보여준다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])

  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  expect(screen.getByText('필수 항목 3개가 남았습니다')).toBeInTheDocument()

  await user.click(screen.getByRole('checkbox', { name: /서비스 이용약관/ }))

  expect(screen.getByText('필수 항목 2개가 남았습니다')).toBeInTheDocument()
})

test('[CONSENT-BTN-01] 필수 항목에 동의하면 다음 단계인 전화번호로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])

  await openPhoneStep(user)

  expect(screen.getByTestId('signup-phone-step')).toBeInTheDocument()
  expect(screen.getByText('2단계 / 4단계')).toBeInTheDocument()
})

test('[CONSENT-STEP-08] 전화번호에서 뒤로 와도 동의 체크가 유지된다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])

  await openPhoneStep(user)
  await user.click(screen.getByRole('button', { name: '뒤로' }))

  expect(screen.getByRole('checkbox', { name: /서비스 이용약관/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /개인정보 수집·이용/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /민감정보\(건강정보\) 처리/ })).toBeChecked()
})

test('[CONSENT-BTN-04] 동의 없이 이용할 때 병원 전화 경로를 보여준다', () => {
  renderApp(routes, ['/signup'])

  expect(screen.getByText('동의 없이 이용하려면 병원으로 전화 주세요 · 02-1234-5678')).toBeInTheDocument()
})

test('[AUTH-SIGNUP-01] 로그인 화면의 회원가입 버튼이 4단계 가입으로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/'])

  await user.click(screen.getByRole('button', { name: '회원가입' }))

  expect(screen.getByTestId('signup-screen')).toBeInTheDocument()
})

test('[AUTH-PHONE-01] 전화번호 단계는 문자 발송 이유와 입력 칸을 안내한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openPhoneStep(user)

  expect(screen.getByText('문자로 인증번호를 보내드립니다')).toBeInTheDocument()
  expect(screen.getByText('병원에서 연락드릴 때도 이 번호를 씁니다')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '전화번호' })).toBeInTheDocument()
})

test('[AUTH-PHONE-03] 전화번호를 입력하고 인증번호 받기를 누르면 인증 단계로 간다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openPhoneStep(user)

  await user.type(screen.getByRole('textbox', { name: '전화번호' }), '010-1234-5678')
  await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

  expect(screen.getByTestId('signup-otp-step')).toBeInTheDocument()
})

test('[AUTH-OTP-01] 인증번호 단계는 숫자 입력 칸 여섯 개를 보여준다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openOtpStep(user)

  expect(screen.getAllByTestId('otp-digit')).toHaveLength(6)
})

test('[AUTH-OTP-02] 인증번호 단계는 남은 시간과 다시 받기를 보여준다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openOtpStep(user)

  expect(screen.getByText('남은 시간 4:32')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '인증번호 다시 받기' })).toBeInTheDocument()
})

test('[AUTH-OTP-05] 가입 인증번호 화면은 입력한 전화번호를 가리지 않고 보여준다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openOtpStep(user)

  expect(screen.getByText('010-1234-5678')).toBeInTheDocument()
})

test('[AUTH-OTP-08] 인증번호 화면은 마지막 문자만 유효하다고 안내한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openOtpStep(user)

  expect(screen.getByText('연달아 누르면 마지막 문자만 유효합니다')).toBeInTheDocument()
})

test('[AUTH-OTP-01] 인증번호 여섯 자리를 채우면 프로필 단계로 이동한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  expect(screen.getByTestId('signup-profile-step')).toBeInTheDocument()
  expect(screen.getByText('4단계 / 4단계')).toBeInTheDocument()
})

test('[AUTH-SIGNUP-05] 인증번호 단계에서 뒤로 가면 입력한 전화번호가 남는다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openOtpStep(user)

  await user.click(screen.getByRole('button', { name: '뒤로' }))

  expect(screen.getByRole('textbox', { name: '전화번호' })).toHaveValue('010-1234-5678')
})

test('[AUTH-PROFILE-01] 프로필 단계는 비밀번호 조건을 미리 보여준다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  expect(screen.getByText('8자 이상·영문/숫자 함께')).toBeInTheDocument()
})

test('[AUTH-PROFILE-03b] 프로필 단계는 비밀번호와 확인 두 칸을 둔다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('비밀번호 확인')).toHaveAttribute('type', 'password')
  expect(screen.getByRole('button', { name: '비밀번호 보기' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '비밀번호 확인 보기' })).toBeInTheDocument()
})

test('[AUTH-PROFILE-05] 생년월일은 날짜 선택기 입력이다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  expect(screen.getByLabelText('생년월일')).toHaveAttribute('type', 'date')
})

test('[AUTH-SIGNUP-06b] 성별은 미리 선택되지 않고 선택해야 가입 완료가 활성화된다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  expect(screen.getByRole('button', { name: '남' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: '여' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: '가입 완료' })).toBeDisabled()
})

test('[AUTH-PROFILE-03] 비밀번호 눈 버튼은 입력을 보이게 한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))

  expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'text')
})

test('[AUTH-PROFILE-07] 필수 프로필을 입력하고 가입 완료하면 홈으로 간다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  await user.type(screen.getByLabelText('비밀번호'), 'Password1')
  await user.type(screen.getByLabelText('비밀번호 확인'), 'Password1')
  await user.type(screen.getByRole('textbox', { name: '이름' }), '홍길동')
  await user.type(screen.getByLabelText('생년월일'), '1980-01-02')
  await user.click(screen.getByRole('button', { name: '남' }))
  await user.click(screen.getByRole('button', { name: '가입 완료' }))

  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})

test('[AUTH-SIGNUP-05] 프로필에서 뒤로 가도 인증번호 입력값이 유지된다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/signup'])
  await openProfileStep(user)

  await user.click(screen.getByRole('button', { name: '뒤로' }))

  expect(screen.getAllByTestId('otp-digit')[0]).toHaveValue('1')
  expect(screen.getAllByTestId('otp-digit')[5]).toHaveValue('6')
})
