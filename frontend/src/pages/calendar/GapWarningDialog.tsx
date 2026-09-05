import type { CSSProperties } from 'react'

// [CAL-GAP-05][CAL-GAP-06] 겹침 경고 — 누구와 몇 분 겹치는지 적고, 진행은 「알겠습니다, 그대로 잡기」다.
//   ⛔ 막연한 경고가 아니다. ⛔ 빨간 버튼이 아니다(되돌릴 수 있는 일이다).
//   [그대로 잡기]를 누르면 allow_overlap=true로 저장한다 — 직원이 경고를 읽고 진행했다는 사실 기록.
//
//   문구는 겹치는 예약이 **어디서 시작하나**로 갈린다(둘 다 CAL-GAP-05의 「누구와 몇 분」):
//   · occupied=false — 고른 시각 뒤에 시작하는 「다음 예약」과 겹친다(틈에 끼워넣기, `:113`).
//   · occupied=true  — 고른 시각보다 **앞서 시작한 이미 찬 자리**를 눌렀다. 앞선 예약에
//     「다음 예약」·「이 자리는 0분」을 적으면 거짓말이 되므로, 이미 있는 예약의 전체 구간을 적는다.

export interface GapWarningDialogProps {
  slotMinutes: number
  gapMinutes: number
  overlap: { patientLabel: string; startLabel: string; endLabel: string; minutes: number }
  /** 고른 시각보다 앞서 시작한 예약과 겹치나 — 「틈에 넣기」가 아니라 「이미 찬 자리」다. */
  occupied: boolean
  onCancel: () => void
  onProceed: () => void
}

export function GapWarningDialog({ slotMinutes, gapMinutes, overlap, occupied, onCancel, onProceed }: GapWarningDialogProps) {
  return (
    <div style={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-label={occupied ? '예약 겹침 경고' : '끼워넣기 경고'} style={styles.dialog}>
        <p style={styles.message}>
          {occupied ? (
            <>
              이 시각에는 이미 예약({overlap.patientLabel} {overlap.startLabel}–{overlap.endLabel})이 있습니다. 진료{' '}
              {slotMinutes}분으로 잡으면 {overlap.minutes}분 겹칩니다.
            </>
          ) : (
            <>
              이 자리는 {gapMinutes}분입니다. 진료 {slotMinutes}분으로 잡으면 다음 예약({overlap.patientLabel}{' '}
              {overlap.startLabel})과 {overlap.minutes}분 겹칩니다.
            </>
          )}
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
    // [G2 전역] 뷰포트를 넘지 않게 상한 + 내부 스크롤 — 하단 버튼이 화면 밖으로 밀리지 않게.
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
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
