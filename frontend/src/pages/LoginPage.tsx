import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { homeFor, type StaffProfile } from '../auth/roles'
import { canAccessPath } from '../shell/navItems'

type Authenticate = (email: string, password: string) => Promise<StaffProfile | void>

export function LoginPage({ onAuthenticate }: { onAuthenticate?: Authenticate }) {
  const auth = useAuthOptional()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  const emailInvalid = emailTouched && !/^\S+@\S+\.\S+$/.test(email)
  const passwordInvalid = passwordTouched && !password

  const authenticate = onAuthenticate ?? auth?.login
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !authenticate) return
    setEmailTouched(true)
    setPasswordTouched(true)
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) return
    setBusy(true)
    setFailure(false)
    try {
      const profile = await authenticate(email, password)
      if (profile) {
        const remembered = readRememberedPath()
        const destination = remembered?.staffId === profile.staffId && canAccessPath(profile.role, remembered.path)
          ? remembered.path
          : homeFor(profile.role)
        sessionStorage.removeItem('staff-session-return')
        navigate(destination, { replace: true })
      }
    } catch {
      setPassword('')
      setFailure(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={styles.page}>
      {/* 로고·눈 아이콘 인라인 sprite — 빌드 후에도 살아남고 currentColor(딥틸)를 상속한다.
          외부 파일(/src/shell/icons.svg) 참조는 vite dev 전용 경로라 빌드 시 404로 깨졌다. */}
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
        <section style={styles.card} aria-labelledby="login-title">
          <h1 id="login-title" style={styles.heading}>직원 로그인</h1>
        <form onSubmit={submit} noValidate>
          <label style={styles.label} htmlFor="staff-email">업무용 이메일</label>
          <input
            id="staff-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailInvalid}
            aria-describedby={emailInvalid ? 'email-error' : undefined}
            style={styles.input}
          />
          {emailInvalid && <p id="email-error" style={styles.fieldError}>이메일 형식을 확인해 주세요</p>}

          <label style={styles.label} htmlFor="staff-password">비밀번호</label>
          <div style={styles.passwordRow}>
            <input
              id="staff-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setPasswordTouched(true)}
              aria-invalid={passwordInvalid}
              style={{ ...styles.input, margin: 0, paddingRight: 'var(--sp-12)' }}
            />
            <button type="button" aria-label={showPassword ? '비밀번호 가리기' : '비밀번호 보기'} onClick={() => setShowPassword((value) => !value)} style={styles.eyeButton}>
              <svg width="20" height="20"><use href={`#${showPassword ? 'eye-off' : 'eye'}`} /></svg>
            </button>
          </div>
          {passwordInvalid && <p style={styles.fieldError}>비밀번호를 입력해 주세요</p>}
          {failure && <p role="alert" style={styles.authError}>로그인 정보를 확인해 주세요</p>}
          <button type="submit" disabled={busy} style={styles.primaryButton}>{busy ? '◌ 로그인 중…' : '로그인'}</button>
          <Link to="/reset-password" style={styles.resetLink}>비밀번호 재설정</Link>
        </form>
        </section>
      </div>
    </main>
  )
}

// onAuthenticate를 주입한 컴포넌트 테스트에서도 같은 화면을 쓸 수 있게 한다.
function useAuthOptional() {
  try { return useAuth() } catch { return null }
}

function readRememberedPath(): { path: string; staffId: string } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem('staff-session-return') ?? 'null') as { path?: unknown; staffId?: unknown } | null
    if (!value || typeof value.path !== 'string' || typeof value.staffId !== 'string' || value.path.includes('?')) return null
    return { path: value.path, staffId: value.staffId }
  } catch { return null }
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--color-ink)', padding: 'var(--sp-6)' },
  stack: { width: 'min(100%, 390px)' },
  brandBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-7)' },
  card: { width: '100%', boxSizing: 'border-box', borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-card)', padding: 'var(--sp-6)' },
  brandMark: { width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--color-primary)', color: 'white' },
  brand: { margin: 0, textAlign: 'center', fontFamily: 'var(--font-logo)', fontSize: 24, color: 'var(--color-primary)' },
  kicker: { margin: 0, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 },
  heading: { fontSize: 18, fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], margin: '0 0 var(--sp-5)' },
  label: { display: 'block', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 13, margin: 'var(--sp-4) 0 var(--sp-2)' },
  input: { boxSizing: 'border-box', width: '100%', minHeight: 42, padding: 'var(--sp-3) var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)', fontSize: 15, background: 'var(--color-surface)' },
  passwordRow: { position: 'relative' },
  eyeButton: { position: 'absolute', right: 6, top: 5, width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, color: 'var(--color-ink-muted)', cursor: 'pointer' },
  fieldError: { margin: 'var(--sp-1) 0 0', color: 'var(--color-danger)', fontSize: 12 },
  authError: { margin: 'var(--sp-4) 0 var(--sp-2)', color: 'var(--color-danger)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 13 },
  primaryButton: { width: '100%', minHeight: 44, marginTop: 'var(--sp-5)', border: 0, borderRadius: 8, background: 'var(--color-primary)', color: 'white', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  resetLink: { display: 'block', marginTop: 'var(--sp-4)', textAlign: 'center', color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], fontSize: 13 },
}
