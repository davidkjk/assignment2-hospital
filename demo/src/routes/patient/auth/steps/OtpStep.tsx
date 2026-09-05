import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SignupWizardContext } from '../SignupWizard'

export function OtpStep({ state, setOtp, next }: SignupWizardContext) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const [retryNotice, setRetryNotice] = useState('')

  const updateDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const nextOtp = [...state.otp]
    nextOtp[index] = digit
    setOtp(nextOtp)

    if (digit) inputRefs.current[index + 1]?.focus()
    if (nextOtp.every(Boolean)) next()
  }

  const resend = () => {
    setOtp(Array.from({ length: 6 }, () => ''))
    setRetryNotice('인증번호를 다시 보냈습니다')
    inputRefs.current[0]?.focus()
  }

  return (
    <div data-testid="signup-otp-step" className="flex min-h-full flex-col">
      <div>
        <h2 className="text-xl font-bold">인증번호를 입력해 주세요</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">{state.phone}</span>으로 보낸 인증번호입니다.
          <br />
          가입을 위해 번호를 확인합니다.
        </p>

        <div className="mt-6 flex justify-between gap-2">
          {state.otp.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element
              }}
              data-testid="otp-digit"
              aria-label={`인증번호 ${index + 1}번째 자리`}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              onChange={(event) => updateDigit(index, event.target.value)}
              className="h-12 w-10 rounded-lg border text-center text-lg font-bold outline-none focus:border-primary"
            />
          ))}
        </div>

        <p className="mt-5 text-center text-sm font-semibold text-amber-700">남은 시간 4:32</p>
        <p className="mt-1 text-center text-xs text-muted-foreground">인증번호는 5분 동안 유효합니다.</p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          연달아 누르면 마지막 문자만 유효합니다
        </p>
      </div>

      <div className="mt-auto pt-6">
        <Button variant="outline" className="h-11 w-full" onClick={resend}>
          인증번호 다시 받기
        </Button>
        {retryNotice && <p className="mt-2 text-center text-xs text-primary">{retryNotice}</p>}
      </div>
    </div>
  )
}
