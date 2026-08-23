import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from '@/components/icons'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// 정본 AUTH-LOGIN-01~09: 전화번호 + 비밀번호 두 칸. 평소 로그인은 OTP 없이 비밀번호(OTP는 가입 시 1회).
// 데모라 실제 인증은 없고 아무 값이나 넣으면 홈으로 간다(AUTH-LOGIN-09).
export function LoginForm() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showPwFindNote, setShowPwFindNote] = useState(false)

  // 하이픈은 앱이 넣어준다(AUTH-LOGIN-02) — 숫자만 받아 010-1234-5678 꼴로 보여준다.
  const onPhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 11)
    const parts = [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11)].filter(Boolean)
    setPhone(parts.join('-'))
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/home')
  }

  return (
    <PhoneFrame>
      <div data-testid="login-form" className="flex h-full flex-col">
        <ScreenHeader title="로그인" onBack={() => navigate('/app')} />

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <form className="flex flex-col gap-5" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-phone">전화번호</Label>
              <Input
                id="login-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-1234-5678"
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
                className="tabular-nums"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="login-password">비밀번호</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-11"
                />
                {/* 눈 토글(AUTH-LOGIN-03): 기본 가림, 현재 칸에서만 보기/가리기 전환. */}
                <button
                  type="button"
                  aria-label={showPassword ? '비밀번호 가리기' : '비밀번호 보기'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" className="mt-2 h-12 w-full text-base">
              로그인
            </Button>
          </form>

          {/* 비밀번호를 잊으셨나요?(AUTH-LOGIN-07) — 딥틸 굵게, 버튼 아래 가운데. 데모라 찾기 화면은 생략 안내만. */}
          <button
            type="button"
            onClick={() => setShowPwFindNote((value) => !value)}
            className="mt-5 block w-full text-center text-sm font-bold text-primary"
          >
            비밀번호를 잊으셨나요?
          </button>
          {showPwFindNote && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              데모에서는 비밀번호 찾기 화면을 생략했습니다
            </p>
          )}

          {/* 전화번호가 바뀌어 로그인 불가(AUTH-LOGIN-08) → 전화번호 변경 안내로. */}
          <button
            type="button"
            onClick={() => navigate('/auth/tel-change')}
            className="mt-3 block w-full text-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            전화번호가 바뀌어 로그인할 수 없나요? ›
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            데모 화면입니다 · 아무 값이나 넣고 로그인하세요
          </p>
        </main>
      </div>
    </PhoneFrame>
  )
}
