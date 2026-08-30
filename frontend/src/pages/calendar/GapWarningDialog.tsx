import type { CSSProperties } from 'react'

// [CAL-GAP-05][CAL-GAP-06] 끼워넣기 경고 — 누구와 몇 분 겹치는지 적고, 진행은 「알겠습니다, 그대로 잡기」다.
//   ⛔ 막연한 경고가 아니다. ⛔ 빨간 버튼이 아니다(되돌릴 수 있는 일이다).
//   [그대로 잡기]를 누르면 allow_overlap=true로 저장한다 — 직원이 경고를 읽고 진행했다는 사실 기록.

export interface GapWarningDialogProps {
  slotMinutes: number
  gapMinutes: number
  overlap: { patientLabel: string; startLabel: string; minutes: number }
  onCancel: () => void
  onProceed: () => void
}

export function GapWarningDialog({ slotMinutes, gapMinutes, overlap, onCancel, onProceed }: GapWarningDialogProps) {
  return (
    <div style={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-label="끼워넣기 경고" style={styles.dialog}>
        <p style={styles.message}>
          이 자리는 {gapMinutes}분입니다. 진료 {slotMinutes}분으로 잡으면 다음 예약({overlap.patientLabel}{' '}
          {overlap.startLabel})과 {overlap.minutes}분 겹칩니다.
        </p>
        <div style={styles.buttons}>
          <button type="button" onClick={onCancel} style={styles.ghost}>
            그만두기
          </button>
          <button type="button" onClick={onProceed} style={styles.primary}>
            알겠습니다, 그대로 잡기
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(16,36,58,.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  dialog: {
    width: 360,
    background: 'var(--color-surface)',
    borderRadius: 10,
    padding: 'var(--sp-5)',
    boxShadow: '0 8px 28px rgba(16,36,58,.2)',
  },
  message: { margin: 0, fontSize: 'var(--fs-body)', lineHeight: 1.5, color: 'var(--color-ink)' },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-4)' },
  ghost: {
    height: 32,
    padding: '0 var(--sp-3)',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'transparent',
    color: 'var(--color-ink-muted)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  primary: {
    height: 32,
    padding: '0 var(--sp-4)',
    borderRadius: 6,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
