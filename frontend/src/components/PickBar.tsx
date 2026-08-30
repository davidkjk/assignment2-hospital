import type { CSSProperties } from 'react'
import { TextButton } from '@/components/staff-ui'

// 고른 뒤의 동작 막대(`PICK-ACT-*`·`PICK-ALL-*`). 늘 있는 것: [✉ 안내 보내기]·[⬇ 내려받기]·[취소].
// 이 둘은 상태와 무관하다 — 어떤 사람에게든 보낼 수 있고 어떤 목록이든 내려받을 수 있다(요구사항 :226·4.7).
// 상태에 매인 동작(도착 처리·진료 대기로)은 밖에서 groupAction으로 넘겨받는다 — 목록마다 뜻이 다르기 때문.
// ⛔ 여러 명에 붙이면 안 되는 것(응급/재예약/되돌리기/번호 보기)은 애초에 여기 없다(`PICK-ACT-01e·01f`).

export type GroupAction =
  | { kind: 'action'; label: string; onRun: () => void }
  | { kind: 'mixed'; message: string }

interface PickBarProps {
  selectedCount: number
  visibleCount: number
  matchTotal?: number
  allMatching: boolean
  groupAction: GroupAction | null
  onSend: () => void
  onDownload: () => void
  onCancel: () => void
  onSelectAllMatching: () => void
  onSelectVisibleOnly: () => void
}

export function PickBar({
  selectedCount,
  visibleCount,
  matchTotal,
  allMatching,
  groupAction,
  onSend,
  onDownload,
  onCancel,
  onSelectAllMatching,
  onSelectVisibleOnly,
}: PickBarProps) {
  const none = selectedCount === 0
  // 「검색 결과 전체」를 따로 물어야 하는 때: 안 보이는 사람이 더 있고, 아직 전체를 켜지 않았다.
  const canOfferAll = !allMatching && matchTotal != null && matchTotal > visibleCount
  const hiddenCount = (matchTotal ?? 0) - visibleCount

  return (
    <div data-testid="pick-bar" data-component="PickBar" role="toolbar" aria-label="선택 동작" style={styles.bar}>
      <span style={styles.count}>{none ? '보낼 사람을 고르세요' : `${selectedCount}명 선택됨`}</span>

      <div style={styles.actions}>
        {groupAction?.kind === 'action' && (
          <button type="button" onClick={groupAction.onRun} style={styles.statusBtn}>{groupAction.label}</button>
        )}
        <button type="button" onClick={onSend} disabled={none} style={none ? { ...styles.primary, ...styles.off } : styles.primary}>
          ✉ 안내 보내기
        </button>
        <button type="button" onClick={onDownload} disabled={none} style={none ? { ...styles.ghost, ...styles.off } : styles.ghost}>
          ⬇ 내려받기
        </button>
        <button type="button" onClick={onCancel} style={styles.ghost}>취소</button>
      </div>

      {groupAction?.kind === 'mixed' && <p style={styles.note}>{groupAction.message}</p>}

      {canOfferAll && (
        <div style={styles.allRow} role="note">
          <span style={styles.allText}>이 검색 결과에는 {matchTotal}명이 있습니다</span>
          <TextButton onClick={onSelectAllMatching}>
            검색 결과 {matchTotal}명 전부 선택
          </TextButton>
        </div>
      )}

      {allMatching && (
        // 색만으로 구분하지 않는다(요구사항 7절) — 주황 띠에 글자가 함께 있고, 되돌리는 길이 같은 자리에.
        <div style={styles.warnRow} role="alert">
          <span style={styles.warnText}>화면에 보이지 않는 {hiddenCount}명이 포함됩니다</span>
          <TextButton onClick={onSelectVisibleOnly}>
            보이는 {visibleCount}명만 선택
          </TextButton>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: 'var(--color-primary-wash)',
    borderTop: '2px solid var(--color-primary)',
  },
  count: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  actions: { display: 'flex', gap: 6, marginLeft: 'auto' },
  statusBtn: {
    height: 30, padding: '0 12px', borderRadius: 6, border: 'none',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  primary: {
    height: 30, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  ghost: {
    height: 30, padding: '0 12px', borderRadius: 6, border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  off: { opacity: 0.5, cursor: 'not-allowed' },
  note: { flexBasis: '100%', margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  allRow: { flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)' },
  allText: { color: 'var(--color-ink-muted)' },
  warnRow: {
    flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 8px', borderRadius: 6, background: 'var(--color-danger-bg)', border: '1px solid var(--color-warn)',
  },
  warnText: { color: 'var(--color-warn)', fontWeight: 600, fontSize: 'var(--fs-sm)' },
}
