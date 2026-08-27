import { useMemo, useState, type CSSProperties } from 'react'
import { BusyButton } from '../../../components/BusyButton'
import { EmptyState } from '../../../components/EmptyState'
import { ROLE_LABEL } from '../../../auth/roles'
import { staffApi, type Department, type StaffMember } from '../../../api/staff'
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
  onInviteEmptyState(): void
}

function isInvited(m: StaffMember): boolean {
  return m.is_active && m.last_sign_in_at === null
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
  onInviteEmptyState,
}: StaffListProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [resentIds, setResentIds] = useState<Set<string>>(new Set())

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
    await staffApi.resendInvite(id)
    setResentIds((prev) => new Set(prev).add(id))
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
            const isDoctor = m.role === 'doctor'
            return (
              <li
                key={m.id}
                data-staff-row
                data-row-name={m.name}
                aria-current={activeProfileId === m.id ? 'true' : undefined}
                style={{ ...styles.row, ...(m.is_active ? null : styles.rowOff), ...(activeProfileId === m.id ? styles.rowActive : null) }}
              >
                <div style={styles.rowMain}>
                  <div style={styles.rowTop}>
                    <span style={styles.name}>
                      {m.name}
                      {self ? '(나)' : ''}
                    </span>
                    <span style={styles.meta}>
                      {ROLE_LABEL[m.role]}
                      {deptName(m.department_id) ? ` · ${deptName(m.department_id)}` : ''}
                    </span>
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

                    <span style={styles.colorCell}>
                      {isDoctor && m.calendar_color_index != null ? (
                        <span
                          aria-hidden="true"
                          style={{
                            ...styles.colorDot,
                            background: `var(--doctor-palette-${m.calendar_color_index}-fill)`,
                            color: `var(--doctor-palette-${m.calendar_color_index})`,
                          }}
                        />
                      ) : (
                        <span style={styles.subMuted}>해당 없음</span>
                      )}
                    </span>
                  </div>

                  {resentIds.has(m.id) && (
                    <span role="status" style={styles.resent}>
                      초대 이메일을 다시 보냈습니다
                    </span>
                  )}
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
                  {m.is_active && !self && (
                    <button type="button" onClick={() => onDeactivate(m)} style={styles.action}>
                      중지
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  col: { flex: '0 0 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  filters: { display: 'flex', gap: 8 },
  chip: {
    height: 30,
    padding: '0 12px',
    borderRadius: 999,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipOn: { borderColor: 'var(--color-primary)', background: 'var(--color-primary-wash)', color: 'var(--color-primary)' },
  errorBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderLeft: '4px solid var(--color-warn)',
    padding: '6px 0 6px 12px',
    color: 'var(--color-warn)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
  },
  retry: {
    height: 28,
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  muted: { fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
  },
  rowOff: { background: 'var(--color-bg)', opacity: 0.85 },
  rowActive: { borderColor: 'var(--color-primary)', boxShadow: 'inset 0 0 0 1px var(--color-primary)' },
  rowMain: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 },
  rowTop: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  meta: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  rowSub: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  subMuted: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  invited: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 999,
    background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
  },
  off: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  colorCell: { display: 'inline-flex', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: '50%', display: 'inline-block', border: '1px solid currentColor' },
  resent: { fontSize: 'var(--fs-sm)', color: 'var(--color-primary)', fontWeight: 600 },
  rowActions: { display: 'flex', gap: 6, flex: 'none' },
  action: {
    height: 30,
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  inviteLink: {
    height: 34,
    padding: '0 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
