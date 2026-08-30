import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

// 가운데서 막아서는 확인 팝업(`PANEL-USE-01~03`). 직원이 배우는 규칙 한 줄:
// *오른쪽에서 열리면 「만드는 중」, 가운데서 막아서면 「확인해야 넘어감」.*
// ⭐ 바깥을 눌러도 닫히지 않는다 — 뒤를 계속 누를 수 있으면 「멈춰 세우기」가 성립하지 않는다.
// ⭐ 되돌릴 수 없는 동작의 빨간 버튼(danger)은 오직 이 확인창 안에서만 쓴다(`BLOCK-CONF-01`).

interface ConfirmDialogProps {
  title: ReactNode
  message?: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  children,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    // 뒤덮개 — 클릭을 삼키기만 하고 onCancel을 부르지 않는다(바깥 클릭으로 닫히지 않음).
    <div style={styles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={styles.dialog}>
        <h2 style={styles.title}>{title}</h2>
        {message && <p style={styles.message}>{message}</p>}
        {children}
        <div style={styles.actions}>
          <button type="button" onClick={onCancel} style={styles.cancel}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={danger ? { ...styles.confirm, ...styles.danger } : styles.confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export const dialogStyles: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(16,36,58,.32)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 100,
  },
  dialog: {
    width: 'min(420px, calc(100vw - 32px))',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: '0 8px 32px rgba(16,36,58,.20)',
    padding: 'var(--sp-5)',
  },
}

const styles: Record<string, CSSProperties> = {
  ...dialogStyles,
  title: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  message: { margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' },
  cancel: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  confirm: {
    height: 34,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  danger: { background: 'var(--color-danger)' },
}
