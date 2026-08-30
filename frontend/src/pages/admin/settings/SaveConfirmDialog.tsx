import type { CSSProperties } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { MessagePreview } from './MessagePreview'

// [HSET-SAVE-06][HSET-SAVE-08][HSET-MSG-12·13] 저장 확인창.
//  - 취소 마감이 바뀐 저장만: 「지금 잡힌 예약 N건이 새로 마감 후가 됩니다」 + 자동 알림이 나가지 않는다는 안내.
//  - 알림 문구를 고친 저장: 잠금화면에 그대로 뜬다는 경고 + 진료과·의사·증상 금지 + 값이 채워진 미리보기.
// 취소 마감이 안 바뀌고 문구도 안 고친 저장은 확인창을 띄우지 않는다(HSET-SAVE-07, 자주 뜨면 안 읽고 누른다).

interface Props {
  cancellationCount: number | null
  changedMessageBodies: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function SaveConfirmDialog({ cancellationCount, changedMessageBodies, onConfirm, onCancel }: Props) {
  const hasMessages = changedMessageBodies.length > 0
  return (
    <ConfirmDialog title="저장하기 전에 확인해 주세요" confirmLabel="저장" cancelLabel="취소" onConfirm={onConfirm} onCancel={onCancel}>
      {cancellationCount !== null && (
        <div style={{ marginBottom: hasMessages ? 12 : 0 }}>
          <p style={{ margin: 0 }}>지금 잡혀 있는 예약 {cancellationCount}건이 새로 마감 후가 됩니다.</p>
          <p style={{ margin: '4px 0 0', color: 'var(--color-ink-muted)', fontSize: 'var(--fs-caption)' }}>
            이 변경으로 자동으로 알림이 나가지는 않습니다.
          </p>
        </div>
      )}
      {hasMessages && (
        <div>
          <p style={{ margin: 0 }}>이 문구는 환자 잠금화면에 그대로 뜨고 되돌릴 수 없습니다.</p>
          <p style={{ margin: '4px 0 8px', color: 'var(--color-warn)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] }}>
            진료과 · 의사 이름 · 증상은 넣지 마세요.
          </p>
          {changedMessageBodies.map((body, i) => (
            <MessagePreview key={i} body={body} />
          ))}
        </div>
      )}
    </ConfirmDialog>
  )
}
