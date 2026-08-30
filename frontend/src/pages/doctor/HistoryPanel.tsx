import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { md } from '../patient/format'

// [DOCTOR-HISTORY-01~06] 완료된 과거 진료기록 — 오른쪽 열의 「작성 칸 아래」(G-7). 현재 예약 제외
//   is_completed=true만 최신순, 읽기 전용·삭제 버튼 없음(HISTORY-04). API가 주지 않는 것을 「전체 기록」
//   이라 부르지 않는다(HISTORY-03). 0건과 조회 실패를 다르게 그린다(0건엔 [다시 시도] 없음).

export interface HistoryRow {
  id: string
  date: string
  department_name?: string | null
  doctor_name?: string | null
  diagnosis?: string | null
  status: string
}

interface HistoryPanelProps {
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  records?: HistoryRow[]
}

export function HistoryPanel({ loading, error, onRetry, records }: HistoryPanelProps) {
  const rows = records ?? []
  return (
    <section aria-label="과거 진료기록" style={styles.panel}>
      <h3 style={styles.heading}>과거 진료기록</h3>
      {loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : error ? (
        <EmptyState kind="error" onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState kind="zero" message="완료된 과거 진료기록이 없습니다" />
      ) : (
        <ul style={styles.list}>
          {rows.map((r) => (
            <li key={r.id} data-id={r.id} style={styles.row}>
              <div style={styles.rowTop}>
                <span style={styles.date}>{md(r.date)}</span>
                <span style={styles.status}>{r.status}</span>
              </div>
              <p style={styles.meta}>
                {[r.department_name, r.doctor_name].filter(Boolean).join(' · ')}
              </p>
              {r.diagnosis && <p style={styles.dx}>{r.diagnosis}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: { padding: 12, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)' },
  heading: { margin: '0 0 8px', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  skeleton: { height: 60, borderRadius: 6, background: 'var(--color-bg)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { padding: '8px 0', borderTop: '1px solid var(--color-divider)' },
  rowTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  date: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  status: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-done)' },
  meta: { margin: '2px 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  dx: { margin: '2px 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
}
