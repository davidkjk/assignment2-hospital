import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import type { Role } from '../../auth/roles'
import type { SectionState } from './format'
import { md, mdHm } from './format'

// [PTDET-QNR-01~04] 사전문진.
//   · 답변 '내용'은 담당 의사만 본다(QNR-03·요구사항 :420·결정 #14·AD-050) — 접수직원·관리자에겐
//     answers가 응답에 실리지 않는다(화면 분기가 아니라 서버가 안 준다).
//   · 답변 '작성 여부'는 직원도 본다(사용자 결정 2026-08-31 A안) — 존재/볼륨은 비밀이 아니다
//     (마이그 00052·00076이 세운 선). 미작성이면 「문진표 요청」으로 안내를 보낸다.

export interface QnrItem {
  appointment_id: string
  /** 연결된 방문 진료일(QNR-01) — "8/5 진료"로 머리에 붙는다. */
  visit_date?: string | null
  submitted_at: string
  answers: Record<string, unknown>
}

/** [QNR-03 A안] 직원이 보는 '작성 여부' 한 줄 — 답변 내용은 없다. submitted_at null = 미작성. */
export interface QnrStatus {
  appointment_id: string
  visit_date?: string | null
  submitted_at?: string | null
}

interface QuestionnaireSectionProps {
  role: Role
  /** 담당 의사용 — 질문/답변 전체. */
  state: SectionState<QnrItem[]>
  /** 직원용 — 예약별 작성 여부(내용 없음). role !== 'doctor'일 때만 쓴다. */
  statuses?: QnrStatus[]
  /** [문진표 요청] — 미작성 환자에게 안내를 보내는 기존 「안내 보내기」로 보낸다. */
  onRequest?: () => void
}

export function QuestionnaireSection({ role, state, statuses = [], onRequest }: QuestionnaireSectionProps) {
  const isDoctor = role === 'doctor'

  // ── 직원(접수·관리자): 답변 내용은 감추고, 작성 여부만 보인다(QNR-03 A안). ──
  if (!isDoctor) {
    return (
      <section aria-label="사전문진" style={styles.section}>
        <h2 style={styles.heading}>사전문진</h2>
        <p style={styles.note}>답변 내용은 담당 의사만 열람합니다</p>

        {state.loading ? (
          <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
        ) : state.error ? (
          <EmptyState kind="error" onRetry={state.retry} />
        ) : statuses.length === 0 ? (
          <p style={styles.empty}>예약이 없어 표시할 사전문진이 없습니다</p>
        ) : (
          <ul style={styles.list}>
            {statuses.map((s) => {
              const done = Boolean(s.submitted_at)
              return (
                <li key={s.appointment_id} data-appointment-id={s.appointment_id} style={styles.statusRow}>
                  {s.visit_date && <span style={styles.visit}>{md(s.visit_date)} 진료</span>}
                  <span style={done ? styles.pillDone : styles.pillMissing}>{done ? '작성완료' : '미작성'}</span>
                </li>
              )
            })}
          </ul>
        )}

        {onRequest && (
          <button type="button" onClick={onRequest} style={styles.askBtn}>문진표 요청</button>
        )}
      </section>
    )
  }

  // ── 담당 의사: 질문/답변 전체(QNR-01). ──
  const items = state.data ?? []
  return (
    <section aria-label="사전문진" style={styles.section}>
      <h2 style={styles.heading}>사전문진</h2>

      {state.loading ? (
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
    padding: 'var(--sp-4)', background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  heading: { margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  note: { margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
  empty: { margin: '0 0 var(--sp-3)', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  askBtn: {
    height: 30, padding: '0 var(--sp-3)', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  skeleton: { height: 72, borderRadius: 6, background: 'var(--color-bg)' },
  list: { listStyle: 'none', margin: '0 0 var(--sp-3)', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  statusRow: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline', padding: 'var(--sp-2) var(--sp-3)', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8 },
  pillDone: { marginLeft: 'auto', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)' },
  pillMissing: { marginLeft: 'auto', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  card: { padding: 'var(--sp-3)', background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8 },
  cardHead: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'baseline', marginBottom: 'var(--sp-2)' },
  visit: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  submitted: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  qa: { margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' },
  qaRow: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--sp-3)' },
  dt: { margin: 0, fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  dd: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
}
