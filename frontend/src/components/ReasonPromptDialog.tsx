import { useState, type CSSProperties } from 'react'
import { dialogStyles } from './ConfirmDialog'

// 사유 한 줄을 받는 가운데 팝업(`UNDO-WHY-*`). ⚠️ 이것은 「확인창」이 아니다 —
// 예/아니오를 묻는 게 아니라 사유를 수집한다. 되돌리기 자체에는 확인창을 두지 않으므로
// (UNDO-CONF-01), UndoControl은 서버가 「사유가 필요하다」고 알려준 경우에만 이 팝업을 띄운다.
// 비어 있으면 [확인]이 열리지 않는다.

interface ReasonPromptDialogProps {
  title: string
  hint?: string
  onSubmit: (reason: string) => void
  onCancel: () => void
}

export function ReasonPromptDialog({ title, hint, onSubmit, onCancel }: ReasonPromptDialogProps) {
  const [reason, setReason] = useState('')
  const empty = reason.trim().length === 0

  return (
    <div style={dialogStyles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label={title} style={dialogStyles.dialog}>
        <h2 style={styles.title}>{title}</h2>
        {hint && <p style={styles.hint}>{hint}</p>}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          aria-label={title}
          style={styles.textarea}
        />
        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.cancel}>취소</button>
          <button
            type="button"
            onClick={() => onSubmit(reason.trim())}
            disabled={empty}
            style={empty ? { ...styles.confirm, ...styles.confirmOff } : styles.confirm}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  hint: { margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  textarea: {
    marginTop: 12,
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    fontSize: 'var(--fs-base)',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  cancel: {
    height: 34, padding: '0 16px', borderRadius: 8,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  confirm: {
    height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: '#fff',
    fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  confirmOff: { background: 'var(--color-sidebar-ink)', opacity: 0.5, cursor: 'not-allowed' },
}
