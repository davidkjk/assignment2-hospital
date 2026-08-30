import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { PatientHistoryRow } from '../../api/patients'
import type { SectionState } from './format'
import { mdHm } from './format'

// [PTDET-VISIT-01~08] 앞으로의 예약과 지난 예약을 한 섹션에서. 취소·부도도 기록이므로 숨기지 않고,
//   책망하지 않는 중립 문구로 적는다(VISIT-05). 상태는 색이 아니라 글자로(DISP-COLOR-01).

export interface VisitData {
  rows: PatientHistoryRow[]
  hasMore: boolean
}

interface VisitSectionProps {
  state: SectionState<VisitData>
  onMore: () => void
  moreLoading?: boolean
}

// 진행 중인 예약은 상단 카드와 같은 서버 상태를 「현재」로 표시한다(VISIT-04).
const ACTIVE = new Set(['도착', '진료대기', '진료중'])
// 취소·부도는 중립 문구로 — 무단/불참/안 오셨 같은 책망 표현을 쓰지 않는다(VISIT-05).
const STATUS_TEXT: Record<string, string> = {
  예약부도: '예약 부도',
  병원취소: '병원 취소',
  환자취소: '환자 취소',
}

function statusText(s?: string): string {
  if (!s) return ''
  return STATUS_TEXT[s] ?? s
}

export function VisitSection({ state, onMore, moreLoading }: VisitSectionProps) {
  const rows = state.data?.rows ?? []
  return (
    <section aria-label="예약·방문 이력" style={styles.section}>
      <h2 style={styles.heading}>예약·방문 이력</h2>
      {state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" onRetry={state.retry} />
      ) : rows.length === 0 ? (
        // [VISIT-06] 빈 자리를 채우려고 새 예약 버튼을 여기에 또 만들지 않는다(셸에 있다).
        <EmptyState kind="zero" message="예약·방문 이력이 없습니다" />
      ) : (
        <>
          <ul style={styles.list}>
            {rows.map((r) => (
              <li key={r.id} data-id={r.id} style={styles.row}>
                <span style={styles.when}>{mdHm(r.occurred_at)}</span>
                {(r.department_name || r.doctor_name) && (
                  <span style={styles.where}>
                    {[r.department_name, r.doctor_name].filter(Boolean).join(' · ')}
                  </span>
                )}
                {ACTIVE.has(r.status ?? '') && <span style={styles.nowBadge}>현재</span>}
                <span style={styles.status}>{statusText(r.status)}</span>
              </li>
            ))}
          </ul>
          {state.data?.hasMore && (
            <button type="button" onClick={onMore} style={styles.more} disabled={moreLoading}>
              {moreLoading ? '◌ 불러오는 중…' : '더 보기'}
            </button>
          )}
        </>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 'var(--sp-4)', background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  heading: { margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  skeleton: { height: 96, borderRadius: 6, background: 'var(--color-bg)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 40,
    padding: 'var(--sp-2) 0', borderTop: '1px solid var(--color-divider)',
  },
  when: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums', minWidth: 92 },
  where: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  nowBadge: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 6, padding: '1px var(--sp-2)',
  },
  status: { marginLeft: 'auto', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  more: {
    marginTop: 'var(--sp-3)', height: 32, padding: '0 var(--sp-4)', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
}
