import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'

export function ChangePasswordPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { session } = useAuth()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = Boolean(current) && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && password === confirm

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy || !session) return
    setBusy(true)
    setError('')
    const response = await fetch('/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ current_password: current, new_password: password }),
    })
    setBusy(false)
    if (!response.ok) { setError(response.status === 400 ? '현재 비밀번호를 확인해 주세요' : '비밀번호를 바꾸지 못했습니다'); return }
    onDone()
  }

  return (
    <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} style={panelStyles.backdrop}>
      <aside aria-label="비밀번호 변경" style={panelStyles.panel}>
        <header style={panelStyles.header}><h2>비밀번호 변경</h2><button onClick={onClose}>닫기</button></header>
        <form onSubmit={submit} data-testid="password-fields" data-source="SET-PW-04~12,16" style={panelStyles.form}>
          <label htmlFor="current-password">현재 비밀번호</label>
          <input id="current-password" type={show ? 'text' : 'password'} value={current} onChange={(event) => setCurrent(event.target.value)} />
          <label htmlFor="change-password">새 비밀번호</label>
          <input id="change-password" type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="change-confirm">새 비밀번호 확인</label>
          <input id="change-confirm" type={show ? 'text' : 'password'} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          <button type="button" onClick={() => setShow((value) => !value)}>{show ? '비밀번호 가리기' : '비밀번호 보기'}</button>
          <ul><li>8자 이상</li><li>영문과 숫자를 함께</li><li>두 입력이 같음</li></ul>
          {error && <p role="alert">{error}</p>}
          <button disabled={!ready || busy}>{busy ? '◌ 바꾸는 중…' : '비밀번호 변경'}</button>
        </form>
      </aside>
    </div>
  )
}

const panelStyles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, background: 'var(--color-done-bg)', display: 'flex', justifyContent: 'flex-end' },
  panel: { width: 390, maxWidth: '100%', height: '100%', background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-divider)', padding: '12px 18px' },
  form: { display: 'grid', gap: 9, padding: 20 },
}
