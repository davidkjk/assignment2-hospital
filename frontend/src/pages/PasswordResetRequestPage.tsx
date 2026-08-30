import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

const SAME_RESPONSE = '입력한 주소가 직원 계정과 연결되어 있다면 재설정 이메일을 보냈습니다.'

export function PasswordResetRequestPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [limited, setLimited] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !/^\S+@\S+\.\S+$/.test(email)) return
    setBusy(true)
    try {
      const response = await fetch('/auth/staff/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      setLimited(response.status === 429)
    } finally {
      setBusy(false)
      setSent(true)
    }
  }
  return (
    <main style={{ maxWidth: 440, margin: '10vh auto', padding: 'var(--sp-8)' }}>
      <h1>비밀번호 재설정</h1>
      <p>업무용 이메일로 새 비밀번호를 만들 수 있는 링크를 보내드립니다.</p>
      {sent ? <p role="status">{limited ? '요청이 너무 많습니다. 잠시 뒤 다시 시도하거나 병원에 알려 주세요.' : SAME_RESPONSE}</p> : (
        <form onSubmit={submit}>
          <label htmlFor="reset-email">업무용 이메일</label>
          <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button disabled={busy}>{busy ? '◌ 보내는 중…' : '재설정 이메일 보내기'}</button>
        </form>
      )}
      <p><Link to="/login">로그인으로 돌아가기</Link></p>
    </main>
  )
}
