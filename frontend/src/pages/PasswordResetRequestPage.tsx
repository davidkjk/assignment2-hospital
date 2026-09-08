import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, ApiError } from '../api/httpClient'

// [STAFF-LOGIN-10] 로그인 화면 셀프 비밀번호 재설정 요청 — 직원이 자기 업무용 이메일로 새 비밀번호를
// 만들 링크를 받는다. 도메인(withlog.app) 인증 후 백엔드가 실제로 메일을 보낼 수 있게 돼 복원됐다
// (2026-09-07, 결정 ⑩ — ⑨의 "셀프 제거"를 뒤집음). 서버가 계정 존재 여부와 무관하게 같은 응답을
// 돌려주므로(개인정보 열거 방지) 이 화면은 성공/실패를 가르지 않고 언제나 같은 안내를 보인다.
// ⭐ 시각은 로그인 화면과 같은 카드·브랜드 블록을 써서 한 흐름으로 보이게 한다(콘솔 정체성 유지).

// 서버가 존재 여부와 무관하게 돌려주는 같은 응답(계정 열거 방지) — 화면도 이 한 문장만 보인다.
const SAME_RESPONSE =
  '입력하신 주소가 직원 계정과 연결되어 있다면, 새 비밀번호를 만들 링크를 이메일로 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.'
const RATE_LIMITED =
  '요청이 많습니다. 잠시 뒤 다시 시도하거나 병원 관리자에게 알려 주세요.'

export function PasswordResetRequestPage() {
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [limited, setLimited] = useState(false)
  const emailInvalid = touched && !/^\S+@\S+\.\S+$/.test(email)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (busy || !/^\S+@\S+\.\S+$/.test(email)) return
    setBusy(true)
    setLimited(false)
    try {
      await apiFetch('/auth/staff/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch (err) {
      // 429(요청 과다)만 다르게 안내한다. 그 밖의 오류도 계정 열거를 막으려 같은 성공 문구로 삼킨다.
      if (err instanceof ApiError && err.status === 429) setLimited(true)
    } finally {
      setBusy(false)
      setSent(true)
    }
  }

  return (
    <main style={styles.page}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <symbol id="hospital" viewBox="0 0 24 24"><path d="M4 21V5h6V2h4v3h6v16M9 9h6M12 6v6M8 21v-5h8v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      </svg>
      <div style={styles.stack}>
        <div style={styles.brandBlock}>
          <div style={styles.brandMark} aria-hidden="true"><svg width="30" height="30"><use href="#hospital" /></svg></div>
          <p style={styles.brand}>가온병원</p>
          <p style={styles.kicker}>직원 업무 시스템</p>
        </div>
        <section style={styles.card} aria-labelledby="reset-title">
          <h1 id="reset-title" style={styles.heading}>비밀번호 재설정</h1>
          {sent ? (
            <p role="status" style={styles.lead}>{limited ? RATE_LIMITED : SAME_RESPONSE}</p>
          ) : (
            <form onSubmit={submit} noValidate>
              <p style={styles.lead}>가입된 업무용 이메일을 입력하시면, 새 비밀번호를 만들 링크를 보내 드립니다.</p>
              <label style={styles.label} htmlFor="reset-email">업무용 이메일</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={emailInvalid}
                aria-describedby={emailInvalid ? 'reset-email-error' : undefined}
                style={styles.input}
              />
              {emailInvalid && <p id="reset-email-error" style={styles.fieldError}>이메일 형식을 확인해 주세요</p>}
              <button type="submit" disabled={busy} style={styles.primaryButton}>{busy ? '◌ 보내는 중…' : '재설정 링크 받기'}</button>
            </form>
          )}
          <Link to="/login" style={styles.backLink}>로그인으로 돌아가기</Link>
        </section>
      </div>
    </main>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--color-bg)', color: 'var(--color-ink)', padding: 'var(--sp-6)' },
  stack: { width: 'min(100%, 390px)' },
  brandBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-7)' },
  card: { width: '100%', boxSizing: 'border-box', borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-card)', padding: 'var(--sp-6)' },
  brandMark: { width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--color-primary)', color: 'white' },
  brand: { margin: 0, textAlign: 'center', fontFamily: 'var(--font-logo)', fontSize: 24, color: 'var(--color-primary)' },
  kicker: { margin: 0, textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 },
  heading: { fontSize: 18, fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], margin: '0 0 var(--sp-4)' },
  lead: { margin: '0 0 var(--sp-4)', color: 'var(--color-ink-muted)', fontSize: 14, lineHeight: 1.6 },
  label: { display: 'block', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 13, margin: 'var(--sp-2) 0 var(--sp-2)' },
  input: { boxSizing: 'border-box', width: '100%', minHeight: 42, padding: 'var(--sp-3) var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)', fontSize: 15, background: 'var(--color-surface)' },
  fieldError: { margin: 'var(--sp-1) 0 0', color: 'var(--color-danger)', fontSize: 12 },
  primaryButton: { width: '100%', minHeight: 44, marginTop: 'var(--sp-5)', border: 0, borderRadius: 8, background: 'var(--color-primary)', color: 'white', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer' },
  backLink: { display: 'block', marginTop: 'var(--sp-5)', textAlign: 'center', color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], fontSize: 13 },
}
