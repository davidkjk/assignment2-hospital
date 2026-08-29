import type { CSSProperties } from 'react'
import type { CandidateGroup as Group, CandidateRow } from '../../../api/patientMerge'

// [MERGE-LIST-01~05] 한 후보 그룹 카드. 그룹 안 행을 모두 보이고, 미리 대표를 확정하지 않는다.
// ⭐ 본문에는 빨간 파괴 버튼도 [삭제]도 두지 않는다(결정 #18) — 회색 테두리 [대표 검토]뿐이고,
//    이 버튼은 데이터를 바꾸지 않고 비교 상태만 연다(MERGE-LIST-05).

interface CandidateGroupProps {
  index: number
  group: Group
  /** 비교 상태를 연다 — 누른 행을 왼쪽(대표 후보), 나머지 한 행을 오른쪽으로 놓는다. */
  onReview: (leftId: string, rightId: string) => void
  /** MERGE-STATE-03 — 오프라인에서는 캐시로 병합을 시작하게 두지 않는다(검토 진입 잠금). */
  disabled?: boolean
}

export function CandidateGroup({ index, group, onReview, disabled = false }: CandidateGroupProps) {
  const title = `후보 그룹 ${String(index + 1).padStart(2, '0')}`
  return (
    <section data-group-card data-group-index={index} aria-label={title} style={styles.card}>
      <div style={styles.head}>
        <h3 style={styles.title}>{title}</h3>
        <span style={styles.count}>{group.rows.length}개 기록</span>
      </div>

      {/* MERGE-LIST-04 — 「확실히 같은 사람」이라 단정하지 않는다. 가족이 번호를 공유할 수 있다. */}
      <p style={styles.caution}>같은 값으로 묶인 후보입니다. 가족이 번호를 공유하면 실제로 다른 사람일 수 있습니다.</p>

      <ul style={styles.rows}>
        {group.rows.map((row) => (
          <li key={row.patient_id} data-candidate-row data-row-id={row.patient_id} style={styles.row}>
            <div style={styles.rowMain}>
              <span style={styles.name}>{row.name}</span>
              <span style={styles.meta}>{row.masked_birth_date}</span>
              <span style={styles.meta}>{row.masked_phone}</span>
              <AccountChip linked={row.account_linked} />
            </div>
            <div style={styles.rowFoot}>
              <span style={styles.counts}>{recordSummary(row)}</span>
              <button
                type="button"
                onClick={() => onReview(row.patient_id, otherId(group.rows, row.patient_id))}
                disabled={disabled}
                style={disabled ? { ...styles.reviewBtn, ...styles.reviewBtnOff } : styles.reviewBtn}
              >
                대표 검토
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function otherId(rows: CandidateRow[], self: string): string {
  return (rows.find((r) => r.patient_id !== self) ?? rows[0]).patient_id
}

function recordSummary(row: CandidateRow): string {
  const c = row.counts
  return `진료기록 ${c.medical_records}건 · 예약 ${c.appointments}건 · 감사 ${c.access_logs}건`
}

export function AccountChip({ linked }: { linked: boolean }) {
  return (
    <span style={linked ? { ...styles.chip, ...styles.chipOn } : styles.chip}>
      {linked ? '계정 연결됨' : '계정 미연결'}
    </span>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 16,
    borderRadius: 'var(--radius-card)',
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-card)',
  },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  count: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  caution: { margin: '6px 0 10px', fontSize: 'var(--fs-sm)', color: 'var(--color-warn)', lineHeight: 1.5 },
  rows: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  row: {
    padding: 12,
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-bg)',
  },
  rowMain: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  name: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  meta: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  rowFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  counts: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  reviewBtn: {
    height: 32,
    padding: '0 14px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  reviewBtnOff: { color: 'var(--color-gray-past)', borderColor: 'var(--color-divider)', cursor: 'not-allowed' },
  chip: {
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 6,
    background: 'var(--color-done-bg)',
    color: 'var(--color-done)',
  },
  chipOn: { background: 'var(--color-primary-wash)', color: 'var(--color-primary)' },
}
