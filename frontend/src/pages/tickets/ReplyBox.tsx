import { useId, useState } from 'react'
import { btnPrimary } from '../../components/staff-ui'

// 답변 입력 + [보내기](REPLY-01) — 같은 상담방에 여러 차례 직원 말풍선. 전송 중 중복·빈 전송 막고 입력 보존(REPLY-02),
// 실패면 answered로 안 바꾸고 입력 보존+재시도(REPLY-03), 성공은 입력만 비움(티켓 in_progress 유지는 훅 REPLY-04).
// answered는 다시 열지 않고 재문의는 새 상담(REPLY-05) — 읽기전용이면 입력·보내기 없이 안내만.
// 시각은 데모 tickets 답변 영역 그대로(textarea + btnPrimary).

export function ReplyBox(props: {
  readOnly: boolean
  sending: boolean
  onSend: (body: string) => Promise<void>
  onDraftChange?: (v: string) => void
}) {
  const { readOnly, sending, onSend, onDraftChange } = props
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState(false)
  const id = useId()

  if (readOnly) {
    // REPLY-05: 종료 티켓은 재답변 없이 새 상담 경로만 안내(막다른 길 방지).
    return (
      <p aria-label="답변 불가" className="border-t border-border/70 px-4 py-3 text-center text-sm text-muted-foreground">
        상담이 종료된 문의입니다 · 재문의는 새 상담으로 접수됩니다
      </p>
    )
  }

  const submit = async () => {
    if (sending || draft.trim() === '') return // REPLY-02: 중복·빈 전송 방지
    setFailed(false)
    try {
      await onSend(draft.trim())
      setDraft('') // REPLY-04 성공: 입력 비움(티켓 상태 유지는 훅)
      onDraftChange?.('')
    } catch {
      setFailed(true) // REPLY-03: draft 보존
    }
  }

  return (
    <section aria-label="답변 작성" className="border-t border-border/70 px-4 py-3">
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">
          답변
        </label>
        <textarea
          id={id}
          aria-label="답변"
          value={draft}
          disabled={sending}
          rows={2}
          placeholder="환자에게 보낼 답변을 적습니다"
          onChange={(e) => {
            setDraft(e.target.value)
            onDraftChange?.(e.target.value)
          }}
          className="min-w-0 flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || draft.trim() === ''}
          aria-busy={sending}
          className={btnPrimary}
        >
          {sending ? '보내는 중…' : '보내기'}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-rose-600">
          보내지 못했습니다. 다시 시도해 주세요.
        </p>
      )}
    </section>
  )
}
