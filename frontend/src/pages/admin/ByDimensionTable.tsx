import type { CSSProperties } from 'react'
import type { StatsByResponse } from '../../api/stats'
import type { DrillTarget } from './MetricCards'

// [STAT-METRIC-02][STAT-DRILL-01] 진료과·의사별 예약 현황.
// 이름은 서버가 준 표시명으로만 받고 UUID/raw 식별자를 노출하지 않는다. 모든 숫자 칸을 누를 수
// 있다(화면 억제 없음, 결정21) — 1건짜리 칸도 눌러 마스킹 명단을 연다.

const COLUMNS: { key: 'booked' | 'visited' | 'no_show'; label: string; metric: string }[] = [
  { key: 'booked', label: '예약', metric: 'booked' },
  { key: 'visited', label: '방문', metric: 'visits' },
  { key: 'no_show', label: '예약 부도', metric: 'no_show' },
]

interface ByDimensionTableProps {
  data: StatsByResponse
  onToggle: (by: 'department' | 'doctor') => void
  onDrillCell: (target: DrillTarget & { dept: string; dim: 'department' | 'doctor' }) => void
}

export function ByDimensionTable({ data, onToggle, onDrillCell }: ByDimensionTableProps) {
  const firstHead = data.by === 'doctor' ? '의사' : '진료과'
  return (
    <section aria-label="진료과·의사별 예약 현황" style={styles.card}>
      <div style={styles.head}>
        <h3 style={styles.title}>진료과·의사별 예약 현황</h3>
        <div role="tablist" aria-label="분류 기준" style={styles.toggle}>
          {(['department', 'doctor'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={data.by === k}
              onClick={() => onToggle(k)}
              style={{ ...styles.toggleBtn, ...(data.by === k ? styles.toggleOn : null) }}
            >
              {k === 'department' ? '진료과별' : '의사별'}
            </button>
          ))}
        </div>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>{firstHead}</th>
            {COLUMNS.map((c) => (
              <th key={c.key} style={{ ...styles.th, textAlign: 'right' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.label}>
              <td style={styles.td}>{r.label}</td>
              {COLUMNS.map((c) => (
                <td key={c.key} style={{ ...styles.td, textAlign: 'right' }}>
                  <button
                    type="button"
                    aria-label={`${r.label} ${c.label} 상세 목록`}
                    onClick={() => onDrillCell({ metric: c.metric, label: `${r.label} · ${c.label}`, dept: r.label, dim: data.by })}
                    style={styles.cellBtn}
                  >
                    {r[c.key].toLocaleString()}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  toggle: { display: 'inline-flex', gap: 'var(--sp-0-5)', padding: 'var(--sp-0-5)', background: 'var(--color-bg)', borderRadius: 8 },
  toggleBtn: {
    height: 28,
    padding: '0 var(--sp-3)',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  toggleOn: { background: 'var(--color-surface)', color: 'var(--color-ink)', boxShadow: 'var(--shadow-card)' },
  table: { width: '100%', marginTop: 'var(--sp-3)', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' },
  th: {
    padding: 'var(--sp-2) var(--sp-2)',
    textAlign: 'left',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink-muted)',
    borderBottom: '1px solid var(--color-divider)',
  },
  td: { padding: 'var(--sp-2) var(--sp-2)', color: 'var(--color-ink)', borderBottom: '1px solid var(--color-divider)' },
  cellBtn: {
    border: 'none',
    background: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
    padding: 0,
  },
}
