import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Gender } from '../signupState'
import type { SignupWizardContext } from '../SignupWizard'

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-lg border px-3 pr-12 text-base outline-none focus:border-primary"
        />
        <button
          type="button"
          aria-label={`${label} ${visible ? '가리기' : '보기'}`}
          onClick={() => setVisible((previous) => !previous)}
          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function ProfileStep({ state, setField, onComplete }: SignupWizardContext & { onComplete: () => void }) {
  const passwordValid =
    state.password.length >= 8 && /[A-Za-z]/.test(state.password) && /\d/.test(state.password)
  const passwordsMatch = Boolean(state.passwordConfirm) && state.password === state.passwordConfirm
  const canComplete =
    passwordValid &&
    passwordsMatch &&
    Boolean(state.name.trim()) &&
    Boolean(state.birthDate) &&
    Boolean(state.gender)
  const genders: Gender[] = ['남', '여']

  return (
    <div data-testid="signup-profile-step" className="flex min-h-full flex-col">
      <div>
        <h2 className="text-xl font-bold">비밀번호와 기본정보를 입력해 주세요</h2>

        <div className="mt-6 space-y-4">
          <PasswordField
            id="signup-password"
            label="비밀번호"
            value={state.password}
            onChange={(value) => setField('password', value)}
          />
          <PasswordField
            id="signup-password-confirm"
            label="비밀번호 확인"
            value={state.passwordConfirm}
            onChange={(value) => setField('passwordConfirm', value)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={passwordValid ? 'font-bold text-primary' : ''}>{passwordValid ? '✓' : '○'}</span>
            <span>8자 이상·영문/숫자 함께</span>
          </div>
          {state.passwordConfirm && !passwordsMatch && (
            <p className="-mt-2 text-xs text-destructive">비밀번호가 일치하지 않습니다</p>
          )}

          <div>
            <label htmlFor="signup-name" className="text-sm font-semibold">
              이름
            </label>
            <input
              id="signup-name"
              type="text"
              value={state.name}
              onChange={(event) => setField('name', event.target.value)}
              className="mt-2 h-12 w-full rounded-lg border px-3 text-base outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="signup-birth-date" className="text-sm font-semibold">
              생년월일
            </label>
            <input
              id="signup-birth-date"
              type="date"
              value={state.birthDate}
              onChange={(event) => setField('birthDate', event.target.value)}
              className="mt-2 h-12 w-full rounded-lg border px-3 text-base outline-none focus:border-primary"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">
              성별 <span className="font-normal text-muted-foreground">(문진 문항 노출에 쓰입니다)</span>
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {genders.map((gender) => (
                <button
                  key={gender}
                  type="button"
                  aria-pressed={state.gender === gender}
                  onClick={() => setField('gender', gender)}
                  className={`h-11 rounded-lg border text-sm font-semibold ${
                    state.gender === gender
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:border-primary'
                  }`}
                >
                  {gender}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={!canComplete}
          onClick={onComplete}
        >
          가입 완료
        </Button>
      </div>
    </div>
  )
}
