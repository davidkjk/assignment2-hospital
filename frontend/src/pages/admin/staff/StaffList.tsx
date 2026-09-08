import { useMemo, useState, type CSSProperties } from 'react'
import { BusyButton } from '../../../components/BusyButton'
import { EmptyState } from '../../../components/EmptyState'
import { LinkShareBox } from '../../../components/LinkShareBox'
import { ROLE_LABEL } from '../../../auth/roles'
import { staffApi, type Department, type StaffMember } from '../../../api/staff'
import { ApiError } from '../../../api/httpClient'
import { formatInvitedDate, formatLastSignIn } from './staffFormat'

// [STAFF-LIST-*·STAFF-ROW-*·STAFF-STATE-01·CAL-COLOR-08] 왼쪽 직원 목록.
// ⭐ 상태 필터는 서버를 다시 부르지 않는다 — 받은 목록의 표시만 줄인다(건수 칩은 전체 기준).
// ⭐ 중지 직원도 남기고 [다시 사용]은 그리지 않는다(G-04). 내 행엔 [중지]가 없다(STAFF-ROW-02).

type Filter = 'all' | 'active' | 'inactive'

interface StaffListProps {
  staff: StaffMember[]
  departments: Department[]
  currentStaffId: string
  loading: boolean
  error: boolean
  onRetry(): void
  activeProfileId: string | null
  onProfile(id: string): void
  onDeactivate(member: StaffMember): void
  onDelete(member: StaffMember): void
  onInviteEmptyState(): void
}

// [STAFF-ACTIVATED-01] 미수락 = 초대만 나가고 아직 비밀번호를 설정하지 않은 활성 직원.
// ⚠️ 판정은 activated_at으로 한다 — last_sign_in_at은 초대 링크를 "클릭"만 해도 채워져, 비번을
//    안 만든 사람이 [비밀번호 재설정]+[중지](수락됨 취급)로 잘못 보였다(00094로 자체 표식 도입).
function isInvited(m: StaffMember): boolean {
  return m.is_active && m.activated_at === null
}

// 이미 들어온(수락한) 활성 직원 — 비밀번호 재설정 대상(STAFF-RESET-PW-01). 미수락은 [재초대]가 맡는다.
function isAccepted(m: StaffMember): boolean {
  return m.is_active && m.activated_at !== null
}

export function StaffList({
  staff,
  departments,
  currentStaffId,
  loading,
  error,
  onRetry,
  activeProfileId,
  onProfile,
  onDeactivate,
  onDelete,
  onInviteEmptyState,
}: StaffListProps) {
  const [filter, setFilter] = useState<Filter>('all')
  // [STAFF-REINVITE-LINK-01·STAFF-RESETPW-LINK-01·하이브리드] 성공하면 메일을 자동 발송하면서(도메인
  //   인증 후) 관리자가 직접 전달할 링크도 그 행에 함께 노출한다. 값은 링크 문자열, 드물게 못 만들면 null.
  //   *Sent 맵은 메일 발송 성공 여부 — 안내 문구를 「메일을 보냈습니다」/「메일 전송 실패, 링크로」로 가른다.
  const [resentLinks, setResentLinks] = useState<Map<string, string | null>>(new Map())
  const [resentSent, setResentSent] = useState<Map<string, boolean>>(new Map())
  const [resendErrors, setResendErrors] = useState<Map<string, string>>(new Map())
  const [resetLinks, setResetLinks] = useState<Map<string, string | null>>(new Map())
  const [resetSent, setResetSent] = useState<Map<string, boolean>>(new Map())
  const [resetErrors, setResetErrors] = useState<Map<string, string>>(new Map())

  const deptName = useMemo(() => {
    const map = new Map(departments.map((d) => [d.id, d.name]))
    return (id: string | null) => (id ? map.get(id) ?? '' : '')
  }, [departments])

  const sorted = useMemo(
    () =>
      [...staff].sort(
        (a, b) =>
          Number(b.is_active) - Number(a.is_active) ||
          a.name.localeCompare(b.name, 'ko') ||
          a.id.localeCompare(b.id),
      ),
    [staff],
  )

  const counts = {
    all: staff.length,
    active: staff.filter((m) => m.is_active).length,
    inactive: staff.filter((m) => !m.is_active).length,
  }
  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: `전체 ${counts.all}` },
    { key: 'active', label: `활성 ${counts.active}` },
    { key: 'inactive', label: `중지됨 ${counts.inactive}` },
  ]

  const visible = sorted.filter((m) =>
    filter === 'active' ? m.is_active : filter === 'inactive' ? !m.is_active : true,
  )

  async function resend(id: string) {
    // 실패해도 조용히 넘어가지 않는다 — 재초대는 발송 한도(429)·이미 수락한 계정(409)으로 자주
    // 막히는데, 그때 아무 표시가 없으면 관리자는 "눌러도 아무 일이 없다"고 느낀다(실사용 지적).
    try {
      const { link, email_sent } = await staffApi.resendInvite(id)
      setResentLinks((prev) => new Map(prev).set(id, link))
      setResentSent((prev) => new Map(prev).set(id, email_sent))
      setResendErrors((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '재초대에 실패했습니다. 잠시 후 다시 시도해 주세요.'
      setResendErrors((prev) => new Map(prev).set(id, message))
      setResentLinks((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function resetPassword(id: string) {
    // [STAFF-RESET-PW-01] 관리자가 활성 직원에게 비밀번호 재설정 링크를 발급한다. 재초대와 마찬가지로
    // 실패(429 등)를 삼키지 않고 그 행에 이유를 보인다(무반응 방지).
    try {
      const { link, email_sent } = await staffApi.resetPassword(id)
      setResetLinks((prev) => new Map(prev).set(id, link))
      setResetSent((prev) => new Map(prev).set(id, email_sent))
      setResetErrors((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '재설정 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setResetErrors((prev) => new Map(prev).set(id, message))
      setResetLinks((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div data-col="left" style={styles.col}>
      <div style={styles.filters} role="group" aria-label="상태 필터">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            data-filter-chip
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            style={filter === c.key ? { ...styles.chip, ...styles.chipOn } : styles.chip}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && staff.length > 0 && (
        <div role="alert" style={styles.errorBar}>
          <span>목록을 불러오지 못했습니다</span>
          <button type="button" onClick={onRetry} style={styles.retry}>
            다시 시도
          </button>
        </div>
      )}

      {loading && staff.length === 0 ? (
        <p role="status" style={styles.muted}>
          직원 목록을 불러오는 중…
        </p>
      ) : error && staff.length === 0 ? (
        <EmptyState kind="error" onRetry={onRetry} />
      ) : staff.length === 0 ? (
        <EmptyState
          kind="zero"
          message="등록된 직원이 없습니다"
          action={
            <button type="button" onClick={onInviteEmptyState} style={styles.inviteLink}>
              직원 초대
            </button>
          }
        />
      ) : (
        <ul role="list" aria-label="직원 목록" style={styles.list}>
          {visible.map((m) => {
            const self = m.id === currentStaffId
            const invited = isInvited(m)
            const accepted = isAccepted(m)
            const isDoctor = m.role === 'doctor'
            return (
              <li
                key={m.id}
                data-staff-row
                data-row-name={m.name}
                aria-current={activeProfileId === m.id ? 'true' : undefined}
                style={{ ...styles.row, ...(m.is_active ? null : styles.rowOff), ...(activeProfileId === m.id ? styles.rowActive : null) }}
              >
                <div style={styles.rowLine}>
                <div style={styles.rowMain}>
                  <div style={styles.rowTop}>
                    <span style={styles.name}>
                      {m.name}
                      {self ? '(나)' : ''}
                    </span>
                    {/* [F-8] 역할은 색 배지로 한눈에(데모 뼈대) — 색만 아니라 글자 병기(DISP-COLOR-01). */}
                    <span style={m.role === 'admin' ? styles.roleBadgeOn : styles.roleBadge}>
                      {ROLE_LABEL[m.role]}
                    </span>
                    {deptName(m.department_id) && (
                      <span style={styles.meta}>{deptName(m.department_id)}</span>
                    )}
                  </div>

                  <div style={styles.rowSub}>
                    {!m.is_active ? (
                      <span style={styles.off}>중지됨</span>
                    ) : invited ? (
                      <span style={styles.invited}>
                        <span style={styles.badge}>
                          <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                            <path d="M5 3h11l-2 4 2 4H5v10H3V3z" />
                          </svg>
                          초대함 · 아직 안 들어옴
                        </span>
                        {m.invited_at && <span style={styles.subMuted}>{formatInvitedDate(m.invited_at)} 초대 보냄</span>}
                      </span>
                    ) : m.last_sign_in_at ? (
                      <span style={styles.subMuted}>마지막 로그인 {formatLastSignIn(m.last_sign_in_at)}</span>
                    ) : null}
                    {/* [CAL-COLOR-08] 목록엔 캘린더 색 표시를 두지 않는다 — 로그인 상태처럼 오인되고(사용자 지적
                        2026-09-01) 편집도 여기서 못 한다. 색은 프로필 패널(PalettePicker)에서만 보이고 고친다. */}
                  </div>
                </div>

                <div style={styles.rowActions}>
                  {isDoctor && (
                    <button type="button" onClick={() => onProfile(m.id)} style={styles.action}>
                      프로필
                    </button>
                  )}
                  {invited && !self && (
                    <BusyButton label="재초대" busyLabel="보내는 중…" onClick={() => resend(m.id)} />
                  )}
                  {/* [STAFF-DELETE-01] 미수락 계정만 삭제(잘못 초대 되돌리기). 되돌릴 수 없어 확인창
                      안에서만 실제 삭제(빨간 버튼은 그 안에서·BLOCK-CONF-01) — 여기선 평범한 버튼. */}
                  {invited && !self && (
                    <button type="button" onClick={() => onDelete(m)} style={styles.action}>
                      삭제
                    </button>
                  )}
                  {/* [STAFF-RESET-PW-01] 이미 들어온 직원이 비번을 잊었을 때 관리자가 재설정 링크 발송. */}
                  {accepted && !self && (
                    <BusyButton label="비밀번호 재설정" busyLabel="보내는 중…" onClick={() => resetPassword(m.id)} />
                  )}
                  {m.is_active && !self && (
                    <button type="button" onClick={() => onDeactivate(m)} style={styles.action}>
                      중지
                    </button>
                  )}
                </div>
                </div>

                {/* [STAFF-REINVITE-LINK-01·STAFF-RESETPW-LINK-01] 링크·알림은 버튼 줄 아래 전체 너비로
                    내린다 — 버튼 옆에 끼면 좁아 답답하다(사용자 지적 2026-09-07). 계정이 살아났다고
                    말하지 않는다(딱지는 그대로, STAFF-ROW-01). */}
                {resentLinks.has(m.id) &&
                  (resentLinks.get(m.id) ? (
                    <LinkShareBox
                      label="재초대 링크"
                      link={resentLinks.get(m.id) as string}
                      guide={resentSent.get(m.id)
                        ? '직원에게 재초대 메일을 보냈습니다. 메일이 안 보이면 아래 링크를 복사해 직접 전달하세요.'
                        : '메일을 보내지 못했어요. 아래 링크를 복사해 직원에게 직접 전달하세요.'}
                    />
                  ) : (
                    <span role="status" style={styles.resendError}>
                      링크를 만들지 못했습니다. 잠시 후 [재초대]를 다시 눌러 주세요.
                    </span>
                  ))}
                {resendErrors.has(m.id) && (
                  <span role="alert" style={styles.resendError}>
                    {resendErrors.get(m.id)}
                  </span>
                )}
                {resetLinks.has(m.id) &&
                  (resetLinks.get(m.id) ? (
                    <LinkShareBox
                      label="비밀번호 재설정 링크"
                      link={resetLinks.get(m.id) as string}
                      guide={resetSent.get(m.id)
                        ? '직원에게 재설정 메일을 보냈습니다. 메일이 안 보이면 아래 링크를 복사해 직접 전달하세요.'
                        : '메일을 보내지 못했어요. 아래 링크를 복사해 직원에게 직접 전달하세요.'}
                    />
                  ) : (
                    <span role="status" style={styles.resendError}>
                      링크를 만들지 못했습니다. 잠시 후 [비밀번호 재설정]을 다시 눌러 주세요.
                    </span>
                  ))}
                {resetErrors.has(m.id) && (
                  <span role="alert" style={styles.resendError}>
                    {resetErrors.get(m.id)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  col: { flex: '0 0 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  filters: { display: 'flex', gap: 'var(--sp-2)' },
  chip: {
    height: 30,
    padding: '0 var(--sp-3)',
    borderRadius: 999,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  chipOn: { borderColor: 'var(--color-primary)', background: 'var(--color-primary-wash)', color: 'var(--color-primary)' },
  errorBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    borderLeft: '4px solid var(--color-warn)',
    padding: 'var(--sp-2) 0 var(--sp-2) var(--sp-3)',
    color: 'var(--color-warn)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  retry: {
    height: 28,
    padding: '0 var(--sp-3)',
    borderRadius: 7,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  muted: { fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  row: {
    // 이름·버튼 줄(rowLine) 아래에 링크/알림을 세로로 쌓으므로 카드 자체는 세로 스택이다.
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-2)',
    padding: 'var(--sp-3) var(--sp-3)',
    borderRadius: 10,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
  },
  // 이름·역할·상태(왼쪽) + 작업 버튼(오른쪽)이 한 줄. 링크/알림은 이 줄 밖(아래)으로 내려 전체 너비.
  rowLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--sp-3)',
  },
  rowOff: { background: 'var(--color-bg)', opacity: 0.85 },
  rowActive: { borderColor: 'var(--color-primary)', boxShadow: 'inset 0 0 0 1px var(--color-primary)' },
  rowMain: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' },
  rowTop: { display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', flexWrap: 'wrap' },
  name: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  meta: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  roleBadge: {
    padding: '1px var(--sp-2)', borderRadius: 6, background: 'var(--color-bg)',
    color: 'var(--color-ink-muted)', fontSize: '11px', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
  roleBadgeOn: {
    padding: '1px var(--sp-2)', borderRadius: 6, background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)', fontSize: '11px', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
  rowSub: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' },
  subMuted: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  invited: { display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    padding: 'var(--sp-0-5) var(--sp-2)',
    borderRadius: 999,
    background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
  off: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  resendError: { fontSize: 'var(--fs-caption)', color: 'var(--color-warn)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  rowActions: { display: 'flex', gap: 'var(--sp-2)', flex: 'none' },
  action: {
    height: 30,
    padding: '0 var(--sp-3)',
    borderRadius: 7,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  inviteLink: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
