import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabaseClient'

export function PasswordResetNewPage({ verifyRecovery }: { verifyRecovery?: () => Promise<boolean> }) {
  const navigate = useNavigate()
  const auth = useAuthOptional()
  const [verifiedOverride, setVerifiedOverride] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!verifyRecovery) return
    void verifyRecovery().then(setVerifiedOverride).catch(() => setVerifiedOverride(false))
  }, [verifyRecovery])

  const valid = verifyRecovery
    ? verifiedOverride
    : auth
      ? (auth.loading ? null : auth.isRecoverySession)
      : false

  if (valid === null) return <p role="status">재설정 링크를 확인하는 중입니다</p>
  if (!valid) return (
    <main style={{ maxWidth: 440, margin: '10vh auto', padding: 32 }}>
      <h1>이 재설정 링크를 사용할 수 없습니다</h1>
      <p>링크가 만료되었거나 이미 사용되었습니다.</p>
      <Link to="/reset-password">비밀번호 재설정 다시 요청</Link>
    </main>
  )

  const ready = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && password === confirm
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError('비밀번호를 바꾸지 못했습니다. 다시 시도해 주세요.'); setBusy(false); return }
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    if (signOutError) { setError('다른 기기의 로그아웃을 마치지 못했습니다. 병원에 알려 주세요.'); setBusy(false); return }
    auth?.finishPasswordRecovery()
    navigate('/login', { replace: true })
  }
  return (
    <main style={{ maxWidth: 440, margin: '10vh auto', padding: 32 }}>
      <h1>새 비밀번호 만들기</h1>
      <form onSubmit={submit}>
        <label htmlFor="new-password">새 비밀번호</label>
        <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <label htmlFor="confirm-password">새 비밀번호 확인</label>
        <input id="confirm-password" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        <p>8자 이상 · 영문과 숫자를 함께 · 두 입력이 같아야 합니다</p>
        {error && <p role="alert">{error}</p>}
        <button disabled={!ready || busy}>{busy ? '◌ 바꾸는 중…' : '비밀번호 바꾸기'}</button>
      </form>
    </main>
  )
}

function useAuthOptional() {
  try { return useAuth() } catch { return null }
}
