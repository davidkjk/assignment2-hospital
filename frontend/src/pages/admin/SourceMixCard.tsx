import type { CSSProperties } from 'react'
import { BASIS_LABEL, type SourceMix } from '../../api/stats'

// [STAT-METRIC-05][결정23] 예약 유입원 — 앱·직원·챗봇을 각각 별도로 세고 섞지 않는다.
// ⛔ 챗봇 예약을 앱 비율에 합치지 않는다 — 합치면 「챗봇이 얼마나 일하나」를 영영 알 수 없다.
// appointments.source='chatbot'는 4단계에 들어온다. 지금은 자리가 있고 값이 0일 뿐이다(표는 안 깨진다).

const ORDER: { key: keyof SourceMix['rows']; label: string }[] = [
  { key: 'app', label: '앱' },
  { key: 'staff', label: '직원' },
  { key: 'chatbot', label: '챗봇' },
]

/** 합이 정확히 100이 되도록 최대 잔여법으로 반올림한다(총합이 어긋나 보이지 않게). */
function percents(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return counts.map(() => 0)
  const raw = counts.map((c) => (c / total) * 100)
  const floor = raw.map((r) => Math.floor(r))
  let remainder = 100 - floor.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  const out = [...floor]
  for (const { i } of order) {
    if (remainder <= 0) break
    out[i] += 1
    remainder -= 1
  }
  return out
}

export function SourceMixCard({ mix }: { mix: SourceMix }) {
  const counts = ORDER.map((o) => mix.rows[o.key])
  const pct = percents(counts)

  return (
    <section aria-label="예약 유입원" style={styles.card}>
      <div style={styles.head}>
        <h3 style={styles.title}>예약 유입원</h3>
        <span style={styles.basis}>{BASIS_LABEL[mix.basis] ?? mix.basis}</span>
      </div>
      <ul style={styles.list}>
        {ORDER.map((o, i) => (
          <li key={o.key} data-testid="source-row" style={styles.row}>
            <div style={styles.rowTop}>
              <span data-testid="source-label">{o.label}</span>
              <span style={styles.num}>
                {counts[i].toLocaleString()}건 · <span data-testid="source-pct">{pct[i]}</span>%
              </span>
            </div>
            <div style={styles.track}>
              <div style={{ ...styles.fill, width: `${pct[i]}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p style={styles.note}>앱·직원·챗봇을 서로 섞지 않고 별도 유입원으로 집계합니다.</p>
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
  list: { listStyle: 'none', margin: 'var(--sp-3) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' },
  row: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' },
  rowTop: { display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  num: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-muted)' },
  track: { height: 6, borderRadius: 3, background: 'var(--color-bg)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, background: 'var(--color-primary)' },
  note: { margin: 'var(--sp-3) 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
