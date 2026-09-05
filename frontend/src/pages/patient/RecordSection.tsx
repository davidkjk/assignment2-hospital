import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { Stethoscope } from '../../components/icons'
import type { PatientHistoryRow } from '../../api/patients'
import type { SectionState } from './format'
import { md } from './format'
import { SectionHead } from './SectionHead'

// [PTDET-RECORD-01~05] 완료된 진료기록만 날짜 역순으로 읽는다. 읽되 고치지 않는다 —
//   수정·삭제 버튼을 만들지 않는다(RECORD-03·04). API가 진단 요약만 주므로 「전체 기록」이라
//   부르지 않는다(RECORD-02). 0건에 삭제·숨김을 암시하지 않는다(RECORD-05).

interface RecordSectionProps {
  state: SectionState<{ rows: PatientHistoryRow[] }>
}

export function RecordSection({ state }: RecordSectionProps) {
  // 진료 중 초안은 섞지 않는다(RECORD-01) — 완료된 기록만.
  const rows = (state.data?.rows ?? []).filter((r) => r.is_completed !== false)
  return (
    <section aria-label="진료기록" style={styles.section}>
      <SectionHead icon={<Stethoscope className="h-4 w-4" />} title="진료기록" count={rows.length} />
      {state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" onRetry={state.retry} />
      ) : rows.length === 0 ? (
        <EmptyState kind="zero" message="완료된 진료기록이 없습니다" />
      ) : (
        <ul style={styles.list}>
          {rows.map((r) => (
            <li key={r.id} data-id={r.id} style={styles.row}>
              <span style={styles.when}>{md(r.occurred_at)}</span>
              {(r.department_name || r.doctor_name) && (
                <span style={styles.where}>
                  {[r.department_name, r.doctor_name].filter(Boolean).join(' · ')}
                </span>
              )}
              <span style={styles.summary}>{r.diagnosis}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 'var(--sp-4)', background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  skeleton: { height: 72, borderRadius: 6, background: 'var(--color-bg)' },
  // 예약·방문 이력·사전문진과 같은 상한 — 기록이 길어도 카드 높이가 균형을 잃지 않게(손검수 2026-08-31).
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 396, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 40,
    padding: 'var(--sp-2) 0', borderTop: '1px solid var(--color-divider)',
  },
  when: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums', minWidth: 48 },
  where: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  summary: { marginLeft: 'auto', fontSize: 'var(--fs-body)', color: 'var(--color-ink)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
}
