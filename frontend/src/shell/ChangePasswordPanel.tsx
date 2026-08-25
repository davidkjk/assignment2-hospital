import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'

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
    <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} style={panelStyles.backdrop}>
      <aside aria-label="비밀번호 변경" style={panelStyles.panel}>
        <header style={panelStyles.header}><h2>비밀번호 변경</h2><button type="button" onClick={onClose}>닫기</button></header>
        <form onSubmit={submit} data-testid="password-fields" data-source="SET-PW-04~12,16" style={panelStyles.form}>
          <label htmlFor="current-password">현재 비밀번호</label>
          <input id="current-password" type={show ? 'text' : 'password'} value={current} onChange={(event) => setCurrent(event.target.value)} />
          <label htmlFor="change-password">새 비밀번호</label>
          <input id="change-password" type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="change-confirm">새 비밀번호 확인</label>
          <input id="change-confirm" type={show ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          <button
            type="button"
            aria-pressed={show}
            onClick={() => setShow((value) => !value)}
            style={{ ...panelStyles.visibilityToggle, color: show ? 'var(--color-accent)' : 'var(--color-text)' }}
          >
            <PasswordVisibilityIcon visible={show} />
            <span>{show ? '비밀번호 가리기' : '비밀번호 보기'}</span>
          </button>
          <ul aria-label="비밀번호 조건" style={panelStyles.rules}>
            {passwordRules.map((rule) => (
              <li
                key={rule.id}
                data-testid="password-rule"
                data-rule={rule.id}
                data-valid={rule.valid}
                style={{ color: rule.valid ? 'var(--color-success)' : 'var(--color-text)' }}
              >
                <span aria-hidden="true">{rule.valid ? '✓' : '·'}</span> {rule.label}
              </li>
            ))}
          </ul>
          {error && <p ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
          <button type="submit" disabled={!ready || busy}>{busy ? '◌ 바꾸는 중…' : '비밀번호 변경'}</button>
        </form>
      </aside>
    </div>
  )
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  const symbol = visible ? 'password-eye-off' : 'password-eye-on'
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <symbol id="password-eye-on" viewBox="0 0 24 24">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </symbol>
      <symbol id="password-eye-off" viewBox="0 0 24 24">
        <path d="m3 3 18 18M10.6 6.3A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a18.7 18.7 0 0 1-3.1 3.7M6.2 6.8C3.9 8.3 2.5 12 2.5 12s3.5 6 9.5 6a10.4 10.4 0 0 0 3-.4M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>
      <use href={`#${symbol}`} />
    </svg>
  )
}

const panelStyles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, background: 'var(--color-done-bg)', display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 390, maxWidth: '100%', height: '100%', background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-divider)', padding: '12px 18px' },
  form: { display: 'grid', gap: 9, padding: 20 },
  visibilityToggle: { minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rules: { display: 'grid', gap: 4, margin: 0, paddingLeft: 20 },
}
