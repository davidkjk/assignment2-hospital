import { useState, type FormEvent } from 'react'
import { Check, ChevronLeft, Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Password() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [saved, setSaved] = useState(false)

  const hasEightCharacters = password.length >= 8
  const hasLetterAndNumber = /[A-Za-z]/.test(password) && /\d/.test(password)
  const passwordsMatch = password.length > 0 && password === confirmation
  const valid = hasEightCharacters && hasLetterAndNumber && passwordsMatch

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (valid) setSaved(true)
  }

  return (
    <PhoneFrame>
      <div data-testid="settings-password" className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate('/settings')}
            className="-ml-2 rounded-full p-1 transition-colors hover:bg-primary/5"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold">비밀번호 변경</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          {saved ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <Check className="h-8 w-8 text-primary" />
              <p className="font-semibold">비밀번호를 바꿨습니다</p>
              <Button onClick={() => navigate('/settings')}>설정으로 돌아가기</Button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={submit}>
              <p className="text-sm leading-6 text-muted-foreground">
                설정에 들어오실 때 본인 확인을 마쳤으니, 새 비밀번호만 입력하시면 됩니다.
              </p>

              <div className="space-y-2">
                <Label htmlFor="new-password">새 비밀번호</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    aria-invalid={password.length > 0 && !hasEightCharacters}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? '새 비밀번호 숨기기' : '새 비밀번호 보기'}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-0 top-0 flex h-8 w-10 items-center justify-center text-primary hover:text-primary/80"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password-confirmation">새 비밀번호 확인</Label>
                <div className="relative">
                  <Input
                    id="new-password-confirmation"
                    type={showConfirmation ? 'text' : 'password'}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    required
                    aria-invalid={confirmation.length > 0 && !passwordsMatch}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmation ? '새 비밀번호 확인 숨기기' : '새 비밀번호 확인 보기'}
                    onClick={() => setShowConfirmation((current) => !current)}
                    className="absolute right-0 top-0 flex h-8 w-10 items-center justify-center text-primary hover:text-primary/80"
                  >
                    {showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border bg-primary/5 p-4" aria-label="비밀번호 조건">
                <PasswordCondition valid={hasEightCharacters} text="8자 이상" />
                <PasswordCondition valid={hasLetterAndNumber} text="영문과 숫자를 함께" />
                <PasswordCondition valid={passwordsMatch} text="두 칸이 서로 같음" />
              </div>

              <Button type="submit" className="h-11 w-full" disabled={!valid}>
                비밀번호 바꾸기
              </Button>
            </form>
          )}
        </main>
      </div>
    </PhoneFrame>
  )
}

function PasswordCondition({ valid, text }: { valid: boolean; text: string }) {
  return (
    <p className={`flex items-center gap-2 text-sm ${valid ? 'text-primary' : 'text-muted-foreground'}`}>
      {valid ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 text-center">·</span>}
      {text}
    </p>
  )
}
