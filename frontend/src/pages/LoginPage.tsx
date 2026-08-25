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
      <section style={styles.card} aria-labelledby="login-title">
        <div style={styles.brandMark} aria-hidden="true"><svg width="30" height="30"><use href="/src/shell/icons.svg#hospital" /></svg></div>
        <p style={styles.brand}>가온병원</p>
        <p style={styles.kicker}>직원 업무 시스템</p>
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
              style={{ ...styles.input, margin: 0, paddingRight: 48 }}
            />
            <button type="button" aria-label={showPassword ? '비밀번호 가리기' : '비밀번호 보기'} onClick={() => setShowPassword((value) => !value)} style={styles.eyeButton}>
              <svg width="20" height="20"><use href={`/src/shell/icons.svg#${showPassword ? 'eye-off' : 'eye'}`} /></svg>
            </button>
          </div>
          {passwordInvalid && <p style={styles.fieldError}>비밀번호를 입력해 주세요</p>}
          {failure && <p role="alert" style={styles.authError}>로그인 정보를 확인해 주세요</p>}
          <button type="submit" disabled={busy} style={styles.primaryButton}>{busy ? '◌ 로그인 중…' : '로그인'}</button>
          <div style={styles.resetBox}>비밀번호를 잊으셨나요? <Link to="/reset-password">비밀번호 재설정</Link></div>
        </form>
      </section>
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
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--color-ink)', padding: 24 },
  card: { width: 'min(100%, 390px)', borderRadius: 16, background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)', padding: 32 },
  brandMark: { width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', margin: '0 auto 8px', background: 'var(--color-primary)', color: 'white' },
  brand: { margin: 0, textAlign: 'center', fontFamily: 'var(--font-logo)', fontSize: 24, color: 'var(--color-primary)' },
  kicker: { margin: '2px 0 28px', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 },
  heading: { fontSize: 20, margin: '0 0 20px' },
  label: { display: 'block', fontWeight: 700, fontSize: 13, margin: '14px 0 7px' },
  input: { boxSizing: 'border-box', width: '100%', minHeight: 42, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-divider)', fontSize: 15, background: 'var(--color-surface)' },
  passwordRow: { position: 'relative' },
  eyeButton: { position: 'absolute', right: 6, top: 5, width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, color: 'var(--color-ink-muted)', cursor: 'pointer' },
  fieldError: { margin: '5px 0 0', color: 'var(--color-danger)', fontSize: 12 },
  authError: { margin: '16px 0 6px', color: 'var(--color-danger)', fontWeight: 700, fontSize: 13 },
  primaryButton: { width: '100%', minHeight: 44, marginTop: 18, border: 0, borderRadius: 8, background: 'var(--color-primary)', color: 'white', fontWeight: 700, cursor: 'pointer' },
  resetBox: { marginTop: 14, padding: 12, textAlign: 'center', background: 'var(--color-bg)', borderRadius: 8, fontSize: 13 },
}
