import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { InlineError } from '../../components/InlineError'
import type { PatientHistoryRow } from '../../api/patients'
import type { SectionState } from './format'

// [PTDET-FAMILY-01~05] 활성 연결만 이름·관계로. 해제한 연결을 회색 행으로 남기지 않고(FAMILY-01),
//   가족의 생년월일·전화·진료내용을 자동으로 펼치지 않는다(FAMILY-02).
//   [ACTION-01] 가족 연결 추가는 화면을 옮기지 않고 패널로 연다 — 라우팅은 페이지가 한다.
//   본인 확인(OTP·예외) 서버 판정은 Task 13이며 여기선 BLOCKED다. 전환 불가 메시지만 서버 문장 그대로 보인다.

interface FamilySectionProps {
  state: SectionState<PatientHistoryRow[]>
  onAddLink: () => void
  /** verify-eligibility가 「전환할 수 없다」를 돌려줬을 때의 서버 문장(FAMILY-04). */
  eligibilityMessage?: string | null
}

export function FamilySection({ state, onAddLink, eligibilityMessage }: FamilySectionProps) {
  const rows = state.data ?? []
  return (
    <section aria-label="가족 관계" style={styles.section}>
      <div style={styles.head}>
        <h2 style={styles.heading}>가족 관계</h2>
        <button type="button" onClick={onAddLink} style={styles.addBtn}>
          가족 연결 추가
        </button>
      </div>
      {eligibilityMessage && <InlineError message={eligibilityMessage} />}
      {state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" screen="가족 목록" onRetry={state.retry} />
      ) : rows.length === 0 ? (
        <EmptyState kind="zero" message="연결된 가족이 없습니다" />
      ) : (
        <ul style={styles.list}>
          {rows.map((r) => (
            <li key={r.id} data-id={r.id} data-name={r.name} style={styles.row}>
              <span style={styles.name}>{r.name}</span>
              {r.relation && <span style={styles.relation}>{r.relation}</span>}
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
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  heading: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  addBtn: {
    height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  skeleton: { height: 48, borderRadius: 6, background: 'var(--color-bg)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  row: {
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 40,
    padding: '8px 0', borderTop: '1px solid var(--color-divider)',
  },
  name: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  relation: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)',
    background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 6, padding: '1px 8px',
  },
}
