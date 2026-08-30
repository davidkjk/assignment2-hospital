import { useState, type CSSProperties } from 'react'
import { ReasonPromptDialog } from './ReasonPromptDialog'

// 상태를 한 칸 되돌리는 조용한 버튼(`UNDO-CONF-01`·`UNDO-BTN-02`). 되돌리기는 「고치는 동작」이지
// 위험한 동작이 아니라 **확인창을 붙이지 않고, 빨간 버튼도 쓰지 않는다** — 잘못 누른 것을 고치는 데
// 또 한 번 물으면 없앤 확인창이 그대로 돌아온다.
//
// ⭐ 사유 입력을 스스로 판단하지 않는다 — 서버가 준 값(requiresReason)만 따른다(UNDO-WHY-01·02).
//    화면이 판단하면 규칙이 두 곳에 생긴다. 사유가 필요하면 확인창이 아니라 「사유 팝업」을 띄운다.

interface UndoControlProps {
  onUndo: (reason?: string) => void
  /** 서버가 「이 되돌리기는 사유가 필요하다」고 알려준 값(진료완료 되돌리기·남의 구간 대신). */
  requiresReason?: boolean
  label?: string
  disabled?: boolean
}

export function UndoControl({ onUndo, requiresReason = false, label = '되돌리기', disabled }: UndoControlProps) {
  const [asking, setAsking] = useState(false)

  function handleClick() {
    if (requiresReason) {
      setAsking(true) // 사유를 받고 나서 되돌린다(아직 되돌리지 않는다)
      return
    }
    onUndo() // 사유가 없어도 되는 경우엔 확인창 없이 바로
  }

  return (
    <>
      <button type="button" className="btn q" onClick={handleClick} disabled={disabled} style={styles.btn}>
        <span aria-hidden="true">↩ </span>{label}
      </button>
      {asking && (
        <ReasonPromptDialog
          title="되돌리기 사유"
          hint="이 되돌리기는 사유를 한 줄 남깁니다."
          onSubmit={(reason) => {
            setAsking(false)
            onUndo(reason)
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  // 조용한 버튼 — 텍스트 색만 딥틸, 배경 없음. 빨강·강조 아님.
  btn: {
    height: 28,
    padding: '0 var(--sp-3)',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
