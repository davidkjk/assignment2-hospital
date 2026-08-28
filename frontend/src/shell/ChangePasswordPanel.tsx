import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Eye, EyeOff, LockKeyhole, X } from '@/components/icons'
import { btnPrimary } from '../components/staff-ui'
import { useAuth } from '../auth/useAuth'

// 비밀번호 변경 = 오른쪽 패널(SHELL-ME-03·SHELL-PW-02) — 화면을 옮기지 않는다.
// 시각은 데모 `StaffShell.tsx`의 PasswordPanel, 로직(현재 비밀번호 확인·/me/password·오류 문구)은 실 것 그대로.
// ⚠️ 데모에는 「현재 비밀번호」 칸이 없다 — 실은 `SET-PW-04~12,16`대로 요구한다(데모가 덜 갖춘 쪽).
const inputCls =
  'h-10 w-full rounded-lg border border-input bg-card px-3 pr-10 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'

export function ChangePasswordPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { session } = useAuth()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement | null>(null)
  const passwordRules = [
    { id: 'length', label: '8자 이상', valid: password.length >= 8 },
    { id: 'composition', label: '영문과 숫자를 함께', valid: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { id: 'confirmation', label: '두 칸이 서로 같음', valid: Boolean(password) && password === confirm },
  ]
  const ready = Boolean(current) && passwordRules.every((rule) => rule.valid)

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy || !session) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ current_password: current, new_password: password }),
      })
      setBusy(false)
      if (!response.ok) {
        setError(response.status === 400 ? '현재 비밀번호를 확인해 주세요' : '비밀번호를 바꾸지 못했습니다')
        return
      }
      onDone()
    } catch {
      setBusy(false)
      setError('비밀번호를 바꾸지 못했습니다')
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      className="fixed inset-0 z-40 flex justify-end bg-foreground/20"
    >
      <aside aria-label="비밀번호 변경" className="relative z-10 flex h-full w-[390px] max-w-full flex-col bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <LockKeyhole className="h-4 w-4 text-primary" /> 비밀번호 변경
          </h2>
          {/* 작은 ✕ 아이콘만 두지 않는다 — 글자를 함께 보인다(DEMO-REVIEW-NOTES F-5·F-8) */}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" /> 닫기
          </button>
        </header>
        <form
          onSubmit={submit}
          data-testid="password-fields"
          data-source="SET-PW-04~12,16"
          className="flex-1 space-y-4 overflow-y-auto p-5"
        >
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              현재 비밀번호
            </label>
            <input
              id="current-password"
              type={show ? 'text' : 'password'}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="change-password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              새 비밀번호
            </label>
            <div className="relative">
              <input
                id="change-password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputCls}
              />
              <button
                type="button"
                aria-pressed={show}
                onClick={() => setShow((value) => !value)}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center"
                style={{ minWidth: 44, minHeight: 44, color: show ? 'var(--color-primary)' : 'var(--color-ink-muted)' }}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{show ? '비밀번호 가리기' : '비밀번호 보기'}</span>
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="change-confirm" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              새 비밀번호 확인
            </label>
            <input
              id="change-confirm"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputCls}
            />
          </div>
          <ul aria-label="비밀번호 조건" className="space-y-1 text-xs">
            {passwordRules.map((rule) => (
              <li
                key={rule.id}
                data-testid="password-rule"
                data-rule={rule.id}
                data-valid={rule.valid}
                className={`flex items-center gap-1.5 ${rule.valid ? 'text-emerald-700' : 'text-muted-foreground'}`}
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${rule.valid ? 'text-emerald-600' : 'text-muted-foreground/40'}`} />
                {rule.label}
              </li>
            ))}
          </ul>
          {error && (
            <p ref={errorRef} role="alert" tabIndex={-1} className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button type="submit" disabled={!ready || busy} className={`${btnPrimary} w-full justify-center`}>
            {busy ? '◌ 바꾸는 중…' : '비밀번호 변경'}
          </button>
        </form>
      </aside>
    </div>
  )
}
