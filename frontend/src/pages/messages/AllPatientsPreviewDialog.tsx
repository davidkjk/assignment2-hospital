import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { MessageKind } from '../../api/messages'

// [Task 28][SEND-ADS-04·06][SEND-ALL-04] 되돌릴 수 없고 건당 돈이 드는 발송 직전의 미리보기.
//   • 광고면 (광고) 접두 + 무료 수신거부가 붙은 실제 모양을 보여준다(저장 body와 같은 규칙).
//   • 전 환자 발송은 안내여도 미리보기를 띄운다(SEND-ALL-04 — 광고 전용 아님).
const OPT_OUT_LINE = '무료 수신거부 080-000-0000'

interface Props {
  kind: MessageKind
  body: string
  targetCount: number
  isAll: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function decoratedPreview(kind: MessageKind, body: string): string {
  return kind === 'marketing' ? `(광고) ${body}\n${OPT_OUT_LINE}` : body
}

export function AllPatientsPreviewDialog({ kind, body, targetCount, isAll, onConfirm, onCancel }: Props) {
  const preview = decoratedPreview(kind, body)
  const who = isAll ? '전 환자' : `${targetCount}명`
  return (
    <ConfirmDialog
      title="이 내용으로 보낼까요?"
      message={`${who}에게 보냅니다. 보낸 뒤에는 되돌릴 수 없습니다.`}
      confirmLabel="보내기"
      cancelLabel="다시 보기"
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '12px 0 0', padding: 12,
        border: '1px solid var(--color-divider)', borderRadius: 8, background: 'var(--color-surface-muted, #f6f8fa)',
        fontFamily: 'inherit', fontSize: 'var(--fs-base)', color: 'var(--color-ink)' }}>{preview}</pre>
    </ConfirmDialog>
  )
}
