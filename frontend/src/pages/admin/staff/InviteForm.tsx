import { useState, type CSSProperties, type Ref } from 'react'
import { BusyButton } from '../../../components/BusyButton'
import { InlineError } from '../../../components/InlineError'
import { ROLE_LABEL, type Role } from '../../../auth/roles'
import { ApiError } from '../../../api/httpClient'
import { staffApi, type Department } from '../../../api/staff'

// [STAFF-INVITE-01~05] 초대 폼 — 오른쪽 칸에 붙박이. 이메일·이름·역할 셋만, 비밀번호 칸 없음.
// ⛔ 의사면 소속 진료과가 필수이고 서버에 보내기 전에 화면이 먼저 막는다(P-08). 서버도 같은 검사.
// ⛔ 언마운트하지 않고 숨긴다(STAFF-PROFILE-10) — 프로필을 보다 돌아와도 쓰던 내용이 살아 있어야.

const ROLE_ORDER: Role[] = ['receptionist', 'doctor', 'admin']

interface InviteFormProps {
  departments: Department[]
  hidden: boolean
  emailRef?: Ref<HTMLInputElement>
  onInvited(): void
}

export function InviteForm({ departments, hidden, emailRef, onInvited }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('receptionist')
  const [departmentId, setDepartmentId] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit() {
    setDone(false)
    setServerError(null)
    if (role === 'doctor' && !departmentId) {
      setValidationError('의사는 소속 진료과를 선택해야 합니다.')
      return
    }
    setValidationError(null)
    try {
      await staffApi.invite({ email, name, role, department_id: role === 'doctor' ? departmentId : null })
      setEmail('')
      setName('')
      setRole('receptionist')
      setDepartmentId('')
      setDone(true)
      onInvited()
    } catch (err) {
      // 실패해도 값을 남긴다(STAFF-INVITE-05) — 서버 문장을 그대로(ERR-MSG-01).
      setServerError(err instanceof ApiError ? err.message : '초대에 실패했습니다')
    }
  }

  return (
    <form
      aria-label="직원 초대"
      hidden={hidden}
      style={hidden ? { display: 'none' } : styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 style={styles.title}>직원 초대</h2>

      <label style={styles.label}>
        이메일
        <input
          ref={emailRef}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="staff@gaon.kr"
          required
          style={styles.input}
        />
      </label>

      <label style={styles.label}>
        이름
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          required
          style={styles.input}
        />
      </label>

      {/* [F-8] 역할은 셋뿐이라 드롭다운보다 세 등분 세그먼트로 한눈에(데모 뼈대). */}
      <div style={styles.label}>
        <span>역할</span>
        <div role="group" aria-label="역할" style={styles.roleGroup}>
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              style={role === r ? styles.roleBtnOn : styles.roleBtn}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {role === 'doctor' && (
        <label style={styles.label}>
          소속 진료과
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={styles.input}>
            <option value="">진료과 선택</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {validationError && <InlineError message={validationError} />}
      {serverError && <InlineError message={serverError} />}

      <div style={styles.actions}>
        {serverError ? (
          <button type="button" onClick={() => void submit()} style={styles.retry}>
            다시 시도
          </button>
        ) : (
          <BusyButton type="submit" label="초대" busyLabel="초대하는 중…" />
        )}
        {done && (
          <span role="status" style={styles.done}>
            초대했습니다
          </span>
        )}
      </div>

      {/* [F-8][STAFF-INVITE-01] 비밀번호 칸이 없는 이유를 관리자에게 알린다. */}
      <p style={styles.hint}>비밀번호는 직원이 초대 메일에서 직접 설정합니다.</p>
    </form>
  )
}

const styles: Record<string, CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontWeight: 600 },
  roleGroup: { display: 'flex', gap: 6 },
  roleBtn: {
    flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  roleBtnOn: {
    flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)', color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  hint: { margin: '2px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  input: {
    height: 34,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 },
  retry: {
    height: 34,
    padding: '0 16px',
    borderRadius: 8,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  done: { fontSize: 'var(--fs-base)', color: 'var(--color-primary)', fontWeight: 600 },
}
