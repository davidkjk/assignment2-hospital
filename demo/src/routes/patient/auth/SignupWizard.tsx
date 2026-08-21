import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useSignupState, TOTAL_SIGNUP_STEPS } from './signupState'
import { ConsentStep } from './steps/ConsentStep'
import { PhoneStep } from './steps/PhoneStep'
import { OtpStep } from './steps/OtpStep'
import { ProfileStep } from './steps/ProfileStep'

export type SignupWizardContext = ReturnType<typeof useSignupState>

// AUTH-SIGNUP-01~05: 동의부터 프로필까지 네 화면을 한 상태에서 오간다.
export function SignupWizard() {
  const navigate = useNavigate()
  const wizard = useSignupState()
  const { state, back } = wizard

  const onBack = () => {
    if (state.step === 0) navigate('/')
    else back()
  }

  return (
    <PhoneFrame>
      <div data-testid="signup-screen" className="flex h-full flex-col">
        <ScreenHeader title="회원가입" onBack={onBack} />

        {/* 진행 표시는 헤더 밴드 아래 회색 띠에(정본 목업 회원가입: teal 헤더 + 회색 진행 띠) */}
        <div
          className="flex items-center gap-3 bg-muted px-5 py-2.5"
          aria-label={`${state.step + 1}단계 / 4단계`}
        >
          <div className="flex flex-1 items-center gap-1" aria-hidden="true">
            {Array.from({ length: TOTAL_SIGNUP_STEPS }, (_, index) => (
              <span
                key={index}
                data-testid="signup-progress-dot"
                className={`h-2 flex-1 rounded-full ${index <= state.step ? 'bg-primary' : 'bg-border'}`}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
            {state.step + 1}단계 / 4단계
          </span>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {state.step === 0 && <ConsentStep {...wizard} />}
          {state.step === 1 && <PhoneStep {...wizard} />}
          {state.step === 2 && <OtpStep {...wizard} />}
          {state.step === 3 && <ProfileStep {...wizard} onComplete={() => navigate('/home')} />}
        </main>
      </div>
    </PhoneFrame>
  )
}
