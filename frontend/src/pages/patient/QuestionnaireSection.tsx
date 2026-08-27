import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { Role } from '../../auth/roles'
import type { SectionState } from './format'
import { md, mdHm } from './format'

// [PTDET-QNR-01~04] 사전문진 — **담당 의사만** 응답을 본다(QNR-03·결정 #14·AD-050).
//   접수직원·관리자에겐 응답을 그리지 않고, 화면 분기만이 아니라 페이지가 아예 요청하지 않는다
//   (answers가 응답에 실리지 않는다). 0건과 권한 제한을 같은 문구로 뭉치지 않는다(QNR-04).

export interface QnrItem {
  appointment_id: string
  /** 연결된 방문 진료일(QNR-01) — "8/5 진료"로 머리에 붙는다. */
  visit_date?: string | null
  submitted_at: string
  answers: Record<string, unknown>
}

interface QuestionnaireSectionProps {
  role: Role
  state: SectionState<QnrItem[]>
}

export function QuestionnaireSection({ role, state }: QuestionnaireSectionProps) {
  const canRead = role === 'doctor'
  const items = state.data ?? []

  return (
    <section aria-label="사전문진" style={styles.section}>
      <h2 style={styles.heading}>사전문진</h2>

      {/* [QNR-03·04] 권한 제한은 해결 경로가 있는 안내다 — 0건과 다르게 그린다. 내부 원인(RLS·정책)은 감춘다. */}
      {!canRead ? (
        <div style={styles.denied}>
          <p style={styles.deniedText}>담당 의사만 열람할 수 있습니다</p>
          <button type="button" style={styles.askBtn}>담당 의사에게 문의</button>
        </div>
      ) : state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" onRetry={state.retry} />
      ) : items.length === 0 ? (
        <EmptyState kind="zero" message="작성한 사전문진이 없습니다" />
      ) : (
        <ul style={styles.list}>
          {items.map((q) => (
            <li key={q.appointment_id} data-appointment-id={q.appointment_id} style={styles.card}>
              <div style={styles.cardHead}>
                {q.visit_date && <span style={styles.visit}>{md(q.visit_date)} 진료</span>}
                <span style={styles.submitted}>{mdHm(q.submitted_at)} 제출</span>
              </div>
              <dl style={styles.qa}>
                {Object.entries(q.answers).map(([term, answer]) => (
                  <div key={term} style={styles.qaRow}>
                    <dt style={styles.dt}>{term}</dt>
                    <dd style={styles.dd}>{String(answer)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 16, background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  heading: { margin: '0 0 12px', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  denied: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  deniedText: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
  askBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
  },
  skeleton: { height: 72, borderRadius: 6, background: 'var(--color-bg)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  card: { padding: 12, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8 },
  cardHead: { display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 8 },
  visit: { fontSize: 'var(--fs-base)', fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  submitted: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  qa: { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  qaRow: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 },
  dt: { margin: 0, fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink-muted)' },
  dd: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink)' },
}
