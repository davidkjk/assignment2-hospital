import { useState } from 'react'
import { AlertTriangle } from '../../components/icons'
import { btnGhost } from '../../components/staff-ui'

// [상담 종료] — 일반 [보내기]와 분리(CLOSE-01)·인접 배치 금지(CLOSE-SEP-01, 오클릭 방지, data-detached).
// 되돌릴 수 없어 확인창 안에서만 실행(CLOSE-02), 미전송 답변이 있으면 '먼저 보낼까요?' 경고 동반(CLOSE-02).
// 처리 중 중복 실행 막고 표시(CLOSE-03), 실패는 in_progress 유지+재시도(CLOSE-04, 상태 유지는 훅).
// 시각은 데모 tickets 분리 종료 영역 + CloseConfirm 오버레이 그대로.

export function CloseTicketButton(props: {
  closing: boolean
  hasUnsentDraft: boolean
  onConfirmClose: () => Promise<void>
}) {
  const { closing, hasUnsentDraft, onConfirmClose } = props
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  const confirm = async () => {
    setFailed(false)
    try {
      await onConfirmClose()
      setOpen(false)
    } catch {
      setFailed(true) // CLOSE-04: in_progress 유지(상태는 훅), 대화·입력 보존은 상위
    }
  }

  return (
    <section
      aria-label="상담 종료"
      data-detached
      className="mt-1 flex items-center justify-between border-t border-dashed border-border/60 px-4 py-3"
    >
      {/* CLOSE-SEP-01: 보내기와 분리 배치 */}
      <span className="text-xs text-muted-foreground">상담이 끝났다면 종료합니다. 종료하면 다시 열 수 없습니다.</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={closing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        상담 종료
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="상담 종료 확인"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-left shadow-xl">
            <h3 className="text-base font-bold">상담을 종료할까요?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              종료하면 이 문의는 다시 열 수 없습니다. 더 물어볼 것이 있으면 새 문의로 이어집니다.
            </p>
            {hasUnsentDraft && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>작성 중인 답변이 있습니다. 먼저 보낼까요?</span>
              </div>
            )}
            {failed && (
              <p role="alert" className="mt-3 text-sm text-rose-600">
                종료하지 못했습니다. 다시 시도해 주세요.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={closing} className={btnGhost}>
                돌아가기
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={closing}
                aria-busy={closing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {closing ? '종료 중…' : '상담 종료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
