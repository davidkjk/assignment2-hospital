import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SignupWizardContext } from '../SignupWizard'

function isPhoneNumber(value: string) {
  return value.replace(/\D/g, '').length >= 10
}

export function PhoneStep({ state, setField, next }: SignupWizardContext) {
  const [error, setError] = useState('')
  const valid = isPhoneNumber(state.phone)

  const continueToOtp = () => {
    if (!valid) {
      setError('전화번호를 확인해 주세요')
      return
    }
    setError('')
    next()
  }

  return (
    <div data-testid="signup-phone-step" className="flex min-h-full flex-col">
      <div>
        <h2 className="text-xl font-bold">전화번호를 입력해 주세요</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <span className="block">문자로 인증번호를 보내드립니다</span>
          <span className="block">병원에서 연락드릴 때도 이 번호를 씁니다</span>
        </p>

        <div className="mt-7">
          <label htmlFor="signup-phone" className="text-sm font-semibold">
            전화번호
          </label>
          <input
            id="signup-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={state.phone}
            onChange={(event) => {
              setField('phone', event.target.value)
              if (error) setError('')
            }}
            onBlur={() => {
              if (state.phone && !isPhoneNumber(state.phone)) setError('전화번호를 확인해 주세요')
            }}
            placeholder="010-1234-5678"
            className="mt-2 h-12 w-full rounded-lg border px-3 text-base outline-none focus:border-primary"
            aria-invalid={Boolean(error)}
          />
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <Button size="lg" className="h-12 w-full text-base" onClick={continueToOtp}>
          인증번호 받기
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">데모에서는 실제 문자를 보내지 않습니다.</p>
      </div>
    </div>
  )
}
