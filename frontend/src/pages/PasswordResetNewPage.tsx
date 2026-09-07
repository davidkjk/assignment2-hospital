import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { authFlowType, clearAuthFlowType, supabase } from '../lib/supabaseClient'

// 이 화면은 두 갈래가 같은 폼을 쓴다:
//   · recovery(비밀번호 찾기)  — PASSWORD_RECOVERY 세션(auth.isRecoverySession)
//   · invite(직원 초대 수락)   — supabase는 초대에 별도 이벤트를 안 내므로 링크의 type=invite
//     표식(authFlowType)으로만 구분한다. 초대는 "최초 비밀번호 설정"이라 문구만 달라진다.
// ⭐ 재초대(reset_password_for_email·type=recovery)도 최초 초대와 같은 '환영합니다' 문구로 통일한다
//   (사용자 결정 2026-09-07). 링크의 type=recovery라 authFlowType으론 초대인지 알 수 없어,
//   백엔드가 redirect_to에 붙인 ?welcome=1 표식으로만 초대 맥락을 안다(폼이 열리는 조건은 그대로 —
//   recovery 세션이라 이미 열린다; 이 표식은 문구만 초대용으로 바꾼다).
function readWelcomeFlag(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('welcome') === '1'
  } catch {
    return false
  }
}

export function PasswordResetNewPage({
  verifyRecovery,
  flowType = authFlowType,
  welcome = readWelcomeFlag(),
}: {
  verifyRecovery?: () => Promise<boolean>
  flowType?: string | null
  welcome?: boolean
}) {
  const navigate = useNavigate()
  const auth = useAuthOptional()
  const [verifiedOverride, setVerifiedOverride] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!verifyRecovery) return
    void verifyRecovery().then(setVerifiedOverride).catch(() => setVerifiedOverride(false))
  }, [verifyRecovery])

  const isInvite = flowType === 'invite' || welcome
  // 초대는 PASSWORD_RECOVERY proof가 없으므로 세션 존재 + type=invite로 연다.
  const inviteReady = isInvite && Boolean(auth?.session)
  const valid = verifyRecovery
    ? verifiedOverride
    : auth
      ? (auth.loading ? null : (auth.isRecoverySession || inviteReady))
      : false

  if (valid === null) {
    return <main style={styles.page}><p role="status" style={styles.status}>{isInvite ? '초대 링크를 확인하는 중입니다' : '재설정 링크를 확인하는 중입니다'}</p></main>
  }
  if (!valid) {
    return (
      <main style={styles.page}>
        <div style={styles.stack}>
          <section style={styles.card}>
            <h1 style={styles.heading}>{isInvite ? '이 초대 링크를 사용할 수 없습니다' : '이 재설정 링크를 사용할 수 없습니다'}</h1>
            <p style={styles.lead}>링크가 만료되었거나 이미 사용되었습니다.</p>
            {isInvite
              ? <p style={styles.lead}>병원 관리자에게 초대 재발송을 요청해 주세요.</p>
              : <Link to="/reset-password" style={styles.resetLink}>비밀번호 재설정 다시 요청</Link>}
          </section>
        </div>
      </main>
    )
  }

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
    clearAuthFlowType()
    navigate('/login', { replace: true })
  }

  return (
    <main style={styles.page}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <symbol id="hospital" viewBox="0 0 24 24"><path d="M4 21V5h6V2h4v3h6v16M9 9h6M12 6v6M8 21v-5h8v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="eye" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></symbol>
        <symbol id="eye-off" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.8M6.2 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
      </svg>
      <div style={styles.stack}>
        <div style={styles.brandBlock}>
          <div style={styles.brandMark} aria-hidden="true"><svg width="30" height="30"><use href="#hospital" /></svg></div>
          <p style={styles.brand}>가온병원</p>
          <p style={styles.kicker}>직원 업무 시스템</p>
        </div>
        <section style={styles.card} aria-labelledby="setpw-title">
          <h1 id="setpw-title" style={styles.heading}>{isInvite ? '가온병원에 오신 것을 환영합니다' : '새 비밀번호 만들기'}</h1>
          {isInvite && <p style={styles.lead}>업무 계정에 사용할 비밀번호를 설정해 주세요.</p>}
          <form onSubmit={submit} noValidate>
            <label style={styles.label} htmlFor="new-password">{isInvite ? '비밀번호' : '새 비밀번호'}</label>
            <div style={styles.passwordRow}>
              <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ ...styles.input, paddingRight: 'var(--sp-12)' }} />
              <button type="button" aria-label={showPassword ? '비밀번호 가리기' : '비밀번호 보기'} onClick={() => setShowPassword((value) => !value)} style={styles.eyeButton}>
                <svg width="20" height="20"><use href={`#${showPassword ? 'eye-off' : 'eye'}`} /></svg>
              </button>
            </div>
            <label style={styles.label} htmlFor="confirm-password">{isInvite ? '비밀번호 확인' : '새 비밀번호 확인'}</label>
            <input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} style={styles.input} />
            <p style={styles.hint}>8자 이상 · 영문과 숫자를 함께 · 두 입력이 같아야 합니다</p>
            {error && <p role="alert" style={styles.authError}>{error}</p>}
            <button type="submit" disabled={!ready || busy} style={styles.primaryButton}>
              {busy ? (isInvite ? '◌ 설정하는 중…' : '◌ 바꾸는 중…') : (isInvite ? '비밀번호 설정' : '비밀번호 바꾸기')}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

function useAuthOptional() {
  try { return useAuth() } catch { return null }
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--color-ink)', padding: 'var(--sp-6)' },
  status: { color: 'var(--color-ink-muted)' },
  stack: { width: 'min(100%, 390px)' },
  brandBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-7)' },
  brandMark: { width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--color-primary)', color: 'white' },
  brand: { margin: 0, textAlign: 'center', fontFamily: 'var(--font-logo)', fontSize: 24, color: 'var(--color-primary)' },
  kicker: { margin: 0, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 },
  card: { width: '100%', boxSizing: 'border-box', borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-card)', padding: 'var(--sp-6)' },
  heading: { fontSize: 18, fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], margin: '0 0 var(--sp-3)' },
  lead: { margin: '0 0 var(--sp-4)', color: 'var(--color-ink-muted)', fontSize: 14 },
  label: { display: 'block', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 13, margin: 'var(--sp-4) 0 var(--sp-2)' },
  input: { boxSizing: 'border-box', width: '100%', minHeight: 42, padding: 'var(--sp-3) var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)', fontSize: 15, background: 'var(--color-surface)' },
  passwordRow: { position: 'relative' },
  eyeButton: { position: 'absolute', right: 6, top: 5, width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, color: 'var(--color-ink-muted)', cursor: 'pointer' },
  hint: { margin: 'var(--sp-2) 0 0', color: 'var(--color-ink-muted)', fontSize: 12 },
  authError: { margin: 'var(--sp-4) 0 var(--sp-2)', color: 'var(--color-danger)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 13 },
  primaryButton: { width: '100%', minHeight: 44, marginTop: 'var(--sp-5)', border: 0, borderRadius: 8, background: 'var(--color-primary)', color: 'white', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  resetLink: { display: 'block', marginTop: 'var(--sp-2)', textAlign: 'center', color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], fontSize: 13 },
}
