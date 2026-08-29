import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge, type BadgeTone } from '../../components/staff-ui/StatusBadge'

// [DISP-COLOR-01] 의사 큐 상태값은 공백 없는 '도착·진료대기·진료중' — StatusBadge 기본 표(공백 있는 '진료 대기')와
//   키가 다르므로 톤을 명시한다. 색만으로 구분 안 하게 글자도 함께(StatusBadge가 지킨다).
const CONSOLE_TONE: Record<string, BadgeTone> = { 도착: 'violet', 진료대기: 'sky', 진료중: 'teal' }

// [DOCTOR-QUEUE-*][DOCTOR-START-01~03] 왼쪽 「오늘 진료 대기」 열. ⭐ 행을 여는 행위 자체가 상태 전이다 —
//   [진료 시작] 버튼을 두지 않는다. 진료대기일 때만 진료중으로 전이하고(transitionTargetOnOpen), 그 밖은
//   아무 전이도 하지 않는다(START-02). 순서는 서버가 정한다(QUEUE-03) — 화면은 받은 대로만 그린다.

export interface DoctorQueueRow {
  /** 예약 식별자(선택·전이·강조의 키). */
  id: string
  patient_id: string
  name: string
  /** [DOCTOR-QUEUE-02][MASK-SRV-01] 서버가 가려서 준 생년월일(1976-**-14). */
  masked_birth_date?: string | null
  /** [DOCTOR-QUEUE-02] 성별(남/여). */
  gender?: string | null
  queue_position: number | null
  waiting_started_at: string | null
  status: string
}

/**
 * [DOCTOR-START-01·02] 행을 열 때의 전이 목표. 진료대기만 진료중으로, 그 밖은 전이하지 않는다.
 * ⚠️ 실제 전이 요청·낙관적 금지·되돌리기는 페이지가 서버 응답을 보고 판정한다(P-07).
 */
export function transitionTargetOnOpen(status: string): string | null {
  return status === '진료대기' ? '진료중' : null
}

interface QueuePanelProps {
  rows: DoctorQueueRow[]
  selectedId: string | null
  onOpen: (row: DoctorQueueRow) => void
  loading: boolean
  error: boolean
  onRetry: () => void
  /** [DOCTOR-QUEUE 헤더] 로그인 의사의 진료과·이름(예: 「정형외과 · 박강우 선생님」). */
  subtitle?: string
  /** 실시간이 끊겨 목록이 낡았다 — 낡음 안내 + [지금 새로고침]. 새 완료 차단은 페이지가 이 신호로 한다. */
  stale?: boolean
  lastSyncedAt?: string | null
  onRefresh?: () => void
}

function waitLabel(startedAt: string | null): string | null {
  if (!startedAt) return null
  const started = new Date(startedAt).getTime()
  if (Number.isNaN(started)) return null
  const minutes = Math.max(0, Math.floor((Date.now() - started) / 60_000))
  return `대기 ${minutes}분`
}

export function QueuePanel({
  rows,
  selectedId,
  onOpen,
  loading,
  error,
  onRetry,
  subtitle,
  stale = false,
  lastSyncedAt,
  onRefresh,
}: QueuePanelProps) {
  return (
    <section aria-label="오늘 진료 대기" style={styles.panel}>
      <header style={styles.head}>
        <h2 style={styles.heading}>오늘 진료 대기</h2>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </header>

      {stale && (
        // [QUEUE-LIVE-02] 낡은 목록 위에서 새 완료를 누르면 남의 기록을 완료시킬 수 있다 — 낡음을 알린다.
        <div role="status" style={styles.stale}>
          <span>연결이 끊겨 목록이 낡았습니다{lastSyncedAt ? ` · 기준 시각 ${lastSyncedAt}` : ''}</span>
          <button type="button" onClick={onRefresh} style={styles.refresh}>지금 새로고침</button>
        </div>
      )}

      {loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : error ? (
        <EmptyState kind="error" onRetry={onRetry} />
      ) : rows.length === 0 ? (
        // [QUEUE-08] 0건엔 사실 문장 + 갈 길만. 예약·당일 방문 버튼을 만들지 않는다(SHELL-ACT-03).
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>오늘 진료 대기 환자가 없습니다</p>
          <p style={styles.emptyHint}>날짜를 바꿔 과거 환자를 찾을 수 있습니다</p>
        </div>
      ) : (
        <ul style={styles.list}>
          {rows.map((r) => {
            const wait = waitLabel(r.waiting_started_at)
            const selected = r.id === selectedId
            return (
              <li key={r.id}>
                <button
                  type="button"
                  data-id={r.id}
                  data-status={r.status}
                  aria-pressed={selected}
                  onClick={() => onOpen(r)}
                  style={selected ? { ...styles.row, ...styles.rowOn } : styles.row}
                >
                  <span style={styles.rowTop}>
                    <span style={styles.name}>
                      <span style={styles.pos}>{r.queue_position ?? '–'}</span>
                      {r.name}
                    </span>
                    <StatusBadge status={r.status} tone={CONSOLE_TONE[r.status]} />
                  </span>
                  <span style={styles.rowSub}>
                    {/* [DOCTOR-QUEUE-02] 생년월일(목록 마스킹) · 성별 — 오른쪽에 대기시간. */}
                    <span style={styles.ident}>
                      {[r.masked_birth_date, r.gender].filter(Boolean).join(' · ')}
                    </span>
                    {wait && <span style={styles.wait}>{wait}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%',
    background: 'var(--color-surface)', borderRight: '1px solid var(--color-divider)',
  },
  head: { padding: '12px 14px', borderBottom: '1px solid var(--color-divider)' },
  heading: { margin: 0, fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--color-ink)' },
  subtitle: { margin: '2px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  stale: {
    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
    padding: '8px 12px', margin: 8, borderRadius: 8,
    background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 'var(--fs-sm)', fontWeight: 600,
  },
  refresh: {
    height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-danger)',
    background: 'var(--color-surface)', color: 'var(--color-danger)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  skeleton: { height: 56, margin: 8, borderRadius: 6, background: 'var(--color-bg)' },
  empty: { padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  emptyTitle: { margin: 0, fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  emptyHint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' },
  row: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', cursor: 'pointer',
  },
  rowOn: { borderColor: 'var(--color-primary)', background: 'var(--color-primary-wash)' },
  rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-base)', fontWeight: 700 },
  pos: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-muted)', minWidth: 14 },
  rowSub: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ident: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  wait: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
}
