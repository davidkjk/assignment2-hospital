import { type CSSProperties } from 'react'
import { dialogStyles } from '../../../components/ConfirmDialog'
import { TextArea } from '@/components/staff-ui'

// [MHIST-REASON-01·03 · EXC-06 · NAV-04·05] 되돌림 사유 입력.
// 되돌리기를 「왜 되돌리는가」로 붙잡는 단계다. 1~200자, 글자 수를 보이고 200 초과는 받지 않는다.
// ⭐ 입력 중 서버 되돌림 호출은 없다 — [확인으로 계속]이 확인창을 열 뿐이다.
// ⚠️ 공용 ReasonPromptDialog는 버튼 문구('확인')·글자수·maxLength가 이 규칙과 달라 자체 구현한다.

const MAX = 200

interface UndoReasonStepProps {
  reason: string
  onReason: (value: string) => void
  onContinue: () => void
  onCancel: () => void
}

export function UndoReasonStep({ reason, onReason, onContinue, onCancel }: UndoReasonStepProps) {
  const len = reason.length
  const valid = len >= 1 && len <= MAX

  return (
    <div style={dialogStyles.scrim} data-testid="dialog-scrim">
      <div role="dialog" aria-modal="true" aria-label="되돌림 사유 입력" style={dialogStyles.dialog}>
        <h2 style={styles.title}>되돌림 사유를 적어 주세요</h2>
        <p style={styles.hint}>왜 이 병합을 되돌리는지 남깁니다. 이 사유는 되돌림 감사 기록에 함께 저장됩니다.</p>
        <TextArea ariaLabel="되돌림 사유" value={reason} maxLength={MAX} onChange={onReason} rows={3} className="mt-3" />
        <div style={styles.count} aria-hidden="true">{len}/{MAX}</div>
        <div style={styles.actions}>
          {/* MHIST-NAV-05 — [취소]는 상세로 돌아가고 아무것도 바꾸지 않는다. */}
          <button type="button" onClick={onCancel} style={styles.cancel}>취소</button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!valid}
            style={valid ? styles.continue : { ...styles.continue, ...styles.continueOff }}
          >
            확인으로 계속
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  hint: { margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', lineHeight: 1.4 },
  count: { marginTop: 6, textAlign: 'right', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)', fontVariantNumeric: 'tabular-nums' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  cancel: {
    height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  continue: {
    height: 34, padding: '0 16px', borderRadius: 8, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 700, cursor: 'pointer',
  },
  continueOff: { background: 'var(--color-sidebar-ink)', opacity: 0.5, cursor: 'not-allowed' },
}
