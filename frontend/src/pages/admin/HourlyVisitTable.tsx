import type { CSSProperties } from 'react'
import { BASIS_LABEL, type VisitsByHour } from '../../api/stats'

// [STAT-METRIC-03] 시간대별 방문 — 실제 방문(진료완료)을 슬롯 시작 시각별로.
// ⛔ 시간 없는 당일 방문을 0시로 몰아넣지 않는다 — 누락을 숨기면 새벽에 환자가 온 것처럼 보인다.
//    「시간 미기록」으로 따로 세운다.

interface HourRow {
  label: string
  count: number
  unrecorded?: boolean
}

function toRows(data: VisitsByHour): HourRow[] {
  const rows: HourRow[] = Object.keys(data.by_hour)
    .map((h) => Number(h))
    .sort((a, b) => a - b)
    .map((h) => ({ label: `${String(h).padStart(2, '0')}시`, count: data.by_hour[String(h)] }))
  if (data.unknown_time > 0) {
    rows.push({ label: '시간 미기록', count: data.unknown_time, unrecorded: true })
  }
  return rows
}

export function HourlyVisitTable({ data }: { data: VisitsByHour }) {
  const rows = toRows(data)
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section aria-label="시간대별 방문" style={styles.card}>
      <div style={styles.head}>
        <h3 style={styles.title}>시간대별 방문</h3>
        <span style={styles.basis}>{BASIS_LABEL[data.basis] ?? data.basis}</span>
      </div>
      <ul style={styles.list}>
        {rows.map((r) => (
          <li key={r.label} style={styles.row}>
            <span style={{ ...styles.hour, ...(r.unrecorded ? styles.unrecorded : null) }}>{r.label}</span>
            <div style={styles.track}>
              <div
                style={{
                  ...styles.fill,
                  width: `${(r.count / max) * 100}%`,
                  background: r.unrecorded ? 'var(--color-gray-past)' : 'var(--color-primary)',
                }}
              />
            </div>
            <span style={styles.num}>{r.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 'var(--sp-4)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  basis: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  list: { listStyle: 'none', margin: 'var(--sp-3) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  row: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', fontSize: 'var(--fs-body)' },
  hour: { width: 72, flexShrink: 0, color: 'var(--color-ink)' },
  unrecorded: { color: 'var(--color-ink-muted)' },
  track: { flex: 1, height: 14, borderRadius: 3, background: 'var(--color-bg)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  num: { width: 40, flexShrink: 0, textAlign: 'right', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
}
