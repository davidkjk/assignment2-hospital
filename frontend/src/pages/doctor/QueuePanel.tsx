import { useState, type CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { AlertTriangle } from '../../components/icons'
import { StatusBadge, type BadgeTone } from '../../components/staff-ui/StatusBadge'

// [DISP-COLOR-01] 의사 큐 상태값은 공백 없는 '도착·진료대기·진료중·진료완료' — StatusBadge 기본 표(공백 있는 '진료 대기')와
//   키가 다르므로 톤을 명시한다. 색만으로 구분 안 하게 글자도 함께(StatusBadge가 지킨다).
const CONSOLE_TONE: Record<string, BadgeTone> = { 도착: 'violet', 진료대기: 'sky', 진료중: 'teal', 진료완료: 'gray' }

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
  /** [DOCTOR-QUEUE-03] 서버가 매긴 표시 순번(정렬 순 1-based). 순번을 화면이 다시 세지 않는다. */
  display_position?: number | null
  /** [DOCTOR-QUEUE-02] 주의 표시 여부(is_urgent_flag). */
  is_urgent?: boolean
  waiting_started_at: string | null
  /** [QUEUE-ROW-06] 현재 상태로 진입한 시각 — 상태별 라벨(경과/대기/분째)의 기준. */
  status_since?: string | null
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

// [QUEUE-ROW-06][DOCTOR-QUEUE-02] 대기시간 글자는 상태마다 다르다 — 도착 = 「N분 경과」(아직 줄 서기 전),
//   진료대기 = 「N분 대기」(줄에서 기다림), 진료중 = 「N분째」(진료가 진행된 시간). 기준 시각은 그 상태로 진입한 때.
function waitLabel(since: string | null | undefined, status: string): string | null {
  if (!since) return null
  const t = new Date(since).getTime()
  if (Number.isNaN(t)) return null
  const m = Math.max(0, Math.floor((Date.now() - t) / 60_000))
  if (status === '진료중') return `${m}분째`
  if (status === '도착') return `${m}분 경과`
  if (status === '진료완료') return `${m}분 전 완료`
  return `${m}분 대기`
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
  const [showDone, setShowDone] = useState(false)
  // [DOCTOR-QUEUE-09] 완료는 따로 모은다 — 대기 목록은 지금 볼 사람에 집중하고, 완료는 접이식으로 뒤에(L60).
  const active = rows.filter((r) => r.status !== '진료완료')
  const completed = rows.filter((r) => r.status === '진료완료')

  const renderRow = (r: DoctorQueueRow) => {
    const wait = waitLabel(r.status_since ?? r.waiting_started_at, r.status)
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
              {/* [DOCTOR-QUEUE-03] 상태별 순번 — 진료중=0(지금 보는 환자)·진료대기=1·2·3…·도착/완료=빈칸. */}
              <span style={styles.pos}>{r.display_position != null ? r.display_position : ''}</span>
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
          {/* [DOCTOR-QUEUE-02] 주의 표시 — 아이콘만이 아니라 텍스트도(색만으로 구분 안 함). */}
          {r.is_urgent && (
            <span style={styles.urgent}>
              <AlertTriangle width={12} height={12} aria-hidden="true" /> 주의 표시
            </span>
          )}
        </button>
      </li>
    )
  }

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
      ) : active.length === 0 && completed.length === 0 ? (
        // [QUEUE-08] 0건엔 사실 문장 + 갈 길만. 예약·당일 방문 버튼을 만들지 않는다(SHELL-ACT-03).
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>오늘 진료 대기 환자가 없습니다</p>
          <p style={styles.emptyHint}>날짜를 바꿔 과거 환자를 찾을 수 있습니다</p>
        </div>
      ) : (
        <div style={styles.body}>
          {active.length === 0 ? (
            <p style={styles.activeEmpty}>대기 중인 환자가 없습니다</p>
          ) : (
            <ul style={styles.list}>{active.map(renderRow)}</ul>
          )}

          {completed.length > 0 && (
            // [DOCTOR-QUEUE-09] 오늘 완료 — 기본은 접혀 있고, 펼치면 방금 완료한 환자를 눌러 수정할 수 있다(L60).
            <div style={styles.doneWrap}>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                style={styles.doneToggle}
              >
                <span>오늘 완료 {completed.length}명</span>
                <span aria-hidden="true">{showDone ? '▾' : '▸'}</span>
              </button>
              {showDone && <ul style={styles.list}>{completed.map(renderRow)}</ul>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%',
    background: 'var(--color-surface)', borderRight: '1px solid var(--color-divider)',
  },
  head: { padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--color-divider)' },
  heading: { margin: 0, fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  subtitle: { margin: 'var(--sp-0-5) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  stale: {
    display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', alignItems: 'flex-start',
    padding: 'var(--sp-2) var(--sp-3)', margin: 'var(--sp-2)', borderRadius: 8,
    background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
  },
  refresh: {
    height: 26, padding: '0 var(--sp-3)', borderRadius: 6, border: '1px solid var(--color-danger)',
    background: 'var(--color-surface)', color: 'var(--color-danger)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  skeleton: { height: 56, margin: 'var(--sp-2)', borderRadius: 6, background: 'var(--color-bg)' },
  empty: { padding: 'var(--sp-6) var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' },
  emptyTitle: { margin: 0, fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  emptyHint: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  list: { listStyle: 'none', margin: 0, padding: 'var(--sp-2)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' },
  activeEmpty: { margin: 0, padding: 'var(--sp-4)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  doneWrap: { borderTop: '1px solid var(--color-divider)', marginTop: 'var(--sp-1)' },
  doneToggle: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--sp-2) var(--sp-3)', border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)',
  },
  row: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)', textAlign: 'left',
    padding: 'var(--sp-2) var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', cursor: 'pointer',
  },
  rowOn: { borderColor: 'var(--color-primary)', background: 'var(--color-primary-wash)' },
  rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' },
  name: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'] },
  pos: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-muted)', minWidth: 14 },
  rowSub: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' },
  ident: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  wait: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  urgent: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-1)', marginTop: 'var(--sp-1)', padding: '1px var(--sp-2)',
    borderRadius: 6, alignSelf: 'flex-start',
    background: 'color-mix(in srgb, var(--color-warn) 12%, var(--color-surface))',
    color: 'var(--color-warn)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
}
