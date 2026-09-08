import { useState, type CSSProperties, type Ref } from 'react'
import { BusyButton } from '../../../components/BusyButton'
import { InlineError } from '../../../components/InlineError'
import { LinkShareBox } from '../../../components/LinkShareBox'
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
  // [STAFF-INVITE-LINK-01·하이브리드] 성공 시 관리자가 직접 전달할 수락 링크. null=아직 없음/못 만듦.
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  // 초대 메일이 자동 발송됐는지 — 문구를 「메일을 보냈습니다」/「메일 전송 실패, 링크로 전달」로 가른다.
  const [emailSent, setEmailSent] = useState(false)

  async function submit() {
    setDone(false)
    setServerError(null)
    setInviteLink(null)
    setEmailSent(false)
    if (role === 'doctor' && !departmentId) {
      setValidationError('의사는 소속 진료과를 선택해야 합니다.')
      return
    }
    setValidationError(null)
    try {
      const { invite_link, email_sent } = await staffApi.invite({
        email, name, role, department_id: role === 'doctor' ? departmentId : null,
      })
      setEmail('')
      setName('')
      setRole('receptionist')
      setDepartmentId('')
      setDone(true)
      setInviteLink(invite_link)
      setEmailSent(email_sent)
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
            {!inviteLink ? '초대했습니다' : emailSent ? '초대 메일을 보냈습니다' : '초대 링크를 만들었습니다'}
          </span>
        )}
      </div>

      {/* [STAFF-INVITE-LINK-01·하이브리드] 초대 메일을 자동 발송하면서도(도메인 인증 후) 수락 링크를
          함께 노출한다 — 메일이 스팸에 빠지거나 실패해도 관리자가 링크로 직접 전달할 수 있게(막다른 길 금지). */}
      {done && inviteLink && (
        <LinkShareBox
          label="초대 링크"
          link={inviteLink}
          guide={emailSent
            ? '직원에게 초대 메일을 보냈습니다. 메일이 안 보이면 아래 링크를 복사해 직접 전달하세요.'
            : '메일을 보내지 못했어요. 아래 링크를 복사해 직원에게 직접 전달하세요.'}
        />
      )}

      {/* 링크를 못 만든 드문 경우(고아 복구 실패) — 막다른 길 대신 다음 행동을 준다. */}
      {done && !inviteLink && (
        <p style={styles.hint}>링크를 만들지 못했습니다. 직원 목록에서 그 직원의 [재초대]를 눌러 다시 만들어 주세요.</p>
      )}

      {/* [F-8][STAFF-INVITE-01] 비밀번호 칸이 없는 이유를 관리자에게 알린다. */}
      <p style={styles.hint}>비밀번호는 직원이 초대 링크에서 직접 설정합니다.</p>
    </form>
  )
}

const styles: Record<string, CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  label: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  roleGroup: { display: 'flex', gap: 'var(--sp-2)' },
  roleBtn: {
    flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  roleBtnOn: {
    flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)', color: 'var(--color-primary)',
    fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  hint: { margin: 'var(--sp-0-5) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  input: {
    height: 34,
    padding: '0 var(--sp-3)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
  },
  actions: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-0-5)' },
  retry: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  done: { fontSize: 'var(--fs-body)', color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
