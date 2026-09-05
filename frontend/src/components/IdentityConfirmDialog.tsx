import type { CSSProperties } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

// 저장 직전 「이 사람이 맞나」를 한 번 멈춰 세우는 확인창(`QUEUE-SAME-01`·`SEARCH-ACT-07`).
// 검색에서 골랐든 직접 쳤든 면제하지 않는다 — 부분 일치로 넓어진 목록이 그대로 사고가 되기 때문.
// 이름·생년월일·전화를 나란히 눈으로 대조하게 둔다.

interface IdentityConfirmDialogProps {
  patient: { name: string; birthDate: string; phone: string }
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function IdentityConfirmDialog({ patient, confirmLabel = '등록', onConfirm, onCancel }: IdentityConfirmDialogProps) {
  return (
    <ConfirmDialog title="이 환자가 맞습니까?" confirmLabel={confirmLabel} onConfirm={onConfirm} onCancel={onCancel}>
      <dl style={styles.list}>
        <div style={styles.row}><dt style={styles.dt}>이름</dt><dd style={styles.dd}>{patient.name}</dd></div>
        <div style={styles.row}><dt style={styles.dt}>생년월일</dt><dd style={styles.dd}>{patient.birthDate}</dd></div>
        <div style={styles.row}><dt style={styles.dt}>전화</dt><dd style={styles.dd}>{patient.phone}</dd></div>
      </dl>
    </ConfirmDialog>
  )
}

const styles: Record<string, CSSProperties> = {
  list: {
    margin: 'var(--sp-4) 0 0',
    padding: 'var(--sp-3)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    display: 'grid',
    gap: 'var(--sp-2)',
  },
  row: { display: 'flex', gap: 'var(--sp-3)', fontSize: 'var(--fs-body)' },
  dt: { margin: 0, width: 64, color: 'var(--color-ink-muted)' },
  dd: { margin: 0, fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
}
