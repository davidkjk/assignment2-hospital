import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { PickBar, type GroupAction } from './PickBar'
import { useSelection } from './useSelection'

export type { GroupAction } from './PickBar'

// ⭐ 여러 명 고르기를 담는 목록(`PICK-*`, 전역 규칙). 같은 부품이 목록 화면 셋에 붙는다
//    (/queue·/today·/patients). ⛔ 캘린더는 뺐다 — 격자가 확정이고 시간순 목록 안은 기각됐다.
// 평소에는 체크칸이 없다 — 접수 창구는 한 줄이 좁을수록 좋은 화면이다. [선택]을 눌러야 돋아난다.
// 고른 뒤 할 수 있는 일이 여럿이라 버튼 이름은 [선택]이지 [안내 보내기]가 아니다(`PICK-BTN-03`).
// 상태에 매인 동작(도착 처리·진료 대기로)의 「무엇」은 목록마다 달라 groupActionFor로 밖에서 받는다.

interface SelectableListProps<T> {
  rows: T[]
  getId: (row: T) => string
  /** 체크칸에 붙일 이름 — 보이는 이름과 같게(예: 환자 이름). 없으면 id. */
  getRowLabel?: (row: T) => string
  getStatus?: (row: T) => string
  renderRow: (row: T) => ReactNode
  /** 평소(선택 아님) 한 줄의 버튼들 — 선택 모드에서는 사라진다(`PICK-ACT-02`). */
  renderRowActions?: (row: T) => ReactNode
  /** 검색 결과 전체 인원(안 보이는 것 포함). 보이는 수보다 크면 「전체 선택」을 따로 묻는다(`PICK-ALL`). */
  matchTotal?: number
  /** 검색어·필터를 나타내는 키 — 바뀌면 선택을 지우고 그 사실을 알린다(`PICK-DROP-01`). */
  filterKey?: string
  /** 고른 사람들의 상태로 상태 동작을 정한다 — 같으면 동작, 섞이면 이유. 목록이 소유한다. */
  groupActionFor?: (distinctStatuses: string[]) => GroupAction | null
  onSend: (mode: { allMatching: boolean }) => void
  onDownload: (mode: { allMatching: boolean }) => void
}

export function SelectableList<T>(props: SelectableListProps<T>) {
  const { rows, getId, getRowLabel, getStatus, renderRow, renderRowActions, matchTotal, filterKey, groupActionFor, onSend, onDownload } = props
  const sel = useSelection()
  const [announce, setAnnounce] = useState('')

  const visibleIds = rows.map(getId)
  const selectedCount = sel.count(matchTotal)

  // 목록이 달라졌는데 숫자가 남아 있으면 그 숫자가 무엇인지 아무도 모른다 — 바뀌면 지우고 알린다.
  const hadSelection = useRef(false)
  hadSelection.current = selectedCount > 0
  const prevFilter = useRef(filterKey)
  useEffect(() => {
    if (prevFilter.current !== filterKey) {
      prevFilter.current = filterKey
      if (hadSelection.current) {
        sel.clear()
        setAnnounce('대상이 바뀌어 선택을 지웠습니다')
      }
    }
  }, [filterKey, sel])

  const headerState = sel.headerState(visibleIds)

  // 상태 동작: 전체 선택 중이면 안 보이는 사람의 상태를 알 수 없어 정하지 않는다.
  let groupAction: GroupAction | null = null
  if (sel.mode === 'pick' && !sel.allMatching && selectedCount > 0 && groupActionFor && getStatus) {
    const distinct = [...new Set(rows.filter((r) => sel.isChecked(getId(r))).map(getStatus))]
    groupAction = groupActionFor(distinct)
  }

  return (
    <div>
      <div role="status" style={styles.srOnly}>{announce}</div>

      <div style={styles.toolbar}>
        {sel.mode === 'normal' ? (
          <button type="button" onClick={sel.enterPick} style={styles.pickBtn}>선택</button>
        ) : (
          <label style={styles.headerCheck}>
            <input
              type="checkbox"
              aria-label="보이는 항목 전체 선택"
              checked={headerState === 'all'}
              ref={(el) => { if (el) el.indeterminate = headerState === 'some' }}
              onChange={() => sel.toggleVisible(visibleIds)}
            />
            <span>전체</span>
          </label>
        )}
      </div>

      {sel.mode === 'pick' && (
        <PickBar
          selectedCount={selectedCount}
          visibleCount={visibleIds.length}
          matchTotal={matchTotal}
          allMatching={sel.allMatching}
          groupAction={groupAction}
          onSend={() => onSend({ allMatching: sel.allMatching })}
          onDownload={() => onDownload({ allMatching: sel.allMatching })}
          onCancel={sel.exitPick}
          onSelectAllMatching={sel.selectAllMatching}
          onSelectVisibleOnly={() => sel.selectVisibleOnly(visibleIds)}
        />
      )}

      <ul style={styles.list}>
        {rows.map((r) => {
          const id = getId(r)
          const label = getRowLabel ? getRowLabel(r) : id
          return (
            <li key={id} style={styles.row}>
              {sel.mode === 'pick' && (
                <input
                  type="checkbox"
                  aria-label={`${label} 선택`}
                  checked={sel.isChecked(id)}
                  onChange={() => sel.toggle(id)}
                />
              )}
              <div style={styles.rowBody}>{renderRow(r)}</div>
              {/* 선택 모드에서는 줄 버튼을 숨긴다 — 남겨두면 체크하려다 [도착 처리]를 누른다. */}
              {sel.mode === 'normal' && renderRowActions && <div style={styles.rowActions}>{renderRowActions(r)}</div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' },
  pickBtn: {
    height: 30, padding: '0 14px', borderRadius: 6,
    border: '1px solid var(--color-divider)', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  headerCheck: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 4px', borderBottom: '1px solid var(--color-divider)', fontSize: 'var(--fs-base)',
  },
  rowBody: { flex: 1 },
  rowActions: { display: 'flex', gap: 6 },
}
