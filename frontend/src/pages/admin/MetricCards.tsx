import type { CSSProperties } from 'react'
import { BASIS_LABEL, type StatsResponse } from '../../api/stats'

// [STAT-METRIC-01][STAT-SCOPE-03][STAT-DRILL-01] 운영 지표 묶음.
// 숫자만 놓지 않고 기준일과 [상세 목록] 가능 여부를 함께 보인다(결정5). 화면은 소수 억제를 하지
// 않는다(결정21) — 1건짜리 값도 그대로 보이고, 목록형 지표는 [상세 목록]로 드릴다운을 연다.
// ⚠️ 평균 대기·오래 기다린 사례는 상세 목록 계약이 아직 없어(Task 25는 건수만) 버튼을 그리지 않는다.

export interface DrillTarget {
  /** 서버 /stats/detail의 metric 파라미터. */
  metric: string
  label: string
}

interface MetricDef {
  key: string
  label: string
  value: number
  unit?: string
  basisCode: string
  /** 있으면 목록형 — [상세 목록] 버튼을 그린다. */
  drill?: string
}

function metricDefs(stats: StatsResponse): MetricDef[] {
  const w = stats.wait
  return [
    { key: 'booked', label: '예약', value: stats.source_mix.total, basisCode: stats.source_mix.basis, drill: 'booked' },
    { key: 'cancelled', label: '취소', value: stats.cancelled.value, basisCode: stats.cancelled.basis, drill: 'cancelled' },
    { key: 'no_show', label: '예약 부도', value: stats.no_show.value, basisCode: stats.no_show.basis, drill: 'no_show' },
    { key: 'visits', label: '실제 방문', value: stats.visits.value, basisCode: stats.visits.basis, drill: 'visits' },
    { key: 'avg_wait', label: '평균 대기시간', value: w.avg_minutes, unit: '분', basisCode: w.basis },
    { key: 'long_wait', label: '오래 기다린 사례', value: w.over_threshold, unit: '건', basisCode: w.basis },
  ]
}

interface MetricCardsProps {
  stats: StatsResponse
  period: { from: string; to: string }
  busy?: boolean
  onDrill: (target: DrillTarget) => void
}

export function MetricCards({ stats, period, busy, onDrill }: MetricCardsProps) {
  const defs = metricDefs(stats)
  const rangeLabel = `${period.from} ~ ${period.to}`
  return (
    <div style={styles.grid}>
      {defs.map((m) => (
        <div key={m.key} role="group" aria-label={m.label} aria-busy={busy || undefined} style={styles.card}>
          <div style={styles.label}>{m.label}</div>
          <div style={styles.value} data-testid={`metric-value-${m.key}`}>
            {busy ? '—' : m.value.toLocaleString()}
            {m.unit && <span style={styles.unit}>{m.unit}</span>}
          </div>
          <div style={styles.basis}>
            {BASIS_LABEL[m.basisCode] ?? m.basisCode} · {rangeLabel}
          </div>
          {m.drill && (
            <button type="button" onClick={() => onDrill({ metric: m.drill!, label: m.label })} style={styles.drillBtn}>
              상세 목록
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  card: {
    padding: '12px 14px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  label: { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)' },
  value: { fontSize: 'var(--fs-num)', fontWeight: 700, lineHeight: 1.1, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  unit: { marginLeft: 2, fontSize: 'var(--fs-base)', fontWeight: 400, color: 'var(--color-ink-muted)' },
  basis: { marginTop: 2, fontSize: 'var(--fs-sm)', color: 'var(--color-gray-past)' },
  drillBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    height: 28,
    padding: '0 10px',
    border: '1px solid var(--color-divider)',
    borderRadius: 7,
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
