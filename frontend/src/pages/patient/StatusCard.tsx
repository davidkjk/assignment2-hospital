import type { CSSProperties } from 'react'
import { mdHm } from './format'

// [PTDET-STATUS-01~05] 머리 가까이 「지금」을 한 장으로 — 가장 가까운 1건만. 색이 아니라 문장으로
//   상태를 말한다(DISP-COLOR-01). 새 예약 버튼은 여기에 두지 않는다(셸 세 문에 있다, STATUS-03).

export interface StatusItem {
  occurred_at: string
  department_name?: string | null
  doctor_name?: string | null
  status: string
}

interface StatusCardProps {
  /** 다가오는 예약·오늘 방문·진료 중 가운데 가장 가까운 1건. */
  current?: StatusItem | null
  /** 활성 예약이 없을 때 자리를 채우는 최근 방문(STATUS-04). */
  recent?: StatusItem | null
  loading?: boolean
}

export function StatusCard({ current, recent, loading }: StatusCardProps) {
  return (
    <section aria-label="현재 상태" data-testid="status-card" style={styles.card}>
      {loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : current ? (
        <Line item={current} />
      ) : recent ? (
        <>
          <p style={styles.eyebrow}>최근 방문</p>
          <Line item={recent} />
        </>
      ) : (
        <p style={styles.empty}>현재 예약이 없습니다</p>
      )}
    </section>
  )
}

function subtitle(item: StatusItem): string {
  return [item.department_name, item.doctor_name].filter(Boolean).join(' · ')
}

function Line({ item }: { item: StatusItem }) {
  const sub = subtitle(item)
  return (
    <div style={styles.line}>
      <span style={styles.when}>{mdHm(item.occurred_at)}</span>
      {sub && <span style={styles.where}>{sub}</span>}
      {/* 상태는 색이 아니라 글자로 — 색만 쓰면 흑백 출력·색약에서 사라진다(DISP-COLOR-01). */}
      <span style={styles.status}>{item.status}</span>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 16,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
  },
  skeleton: { height: 24, borderRadius: 6, background: 'var(--color-bg)' },
  eyebrow: {
    margin: '0 0 6px', fontSize: 'var(--fs-sm)', fontWeight: 700, letterSpacing: '.04em',
    color: 'var(--color-ink-muted)', textTransform: 'uppercase',
  },
  line: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  when: { fontSize: 'var(--fs-lg)', fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  where: { fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)', fontWeight: 600 },
  status: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-primary)' },
  empty: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
}
