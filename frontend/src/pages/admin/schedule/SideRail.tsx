import type { CSSProperties } from 'react'
import { DirtyDot } from './DirtyDot'

// [SCHED-TAB-01] 왼쪽 세로줄 다섯 줄 + 오른쪽 내용. ⭐ 세로줄에 놓는 것은 「무슨 일을 하는 곳인가」이지
//   「누구의 것인가」가 아니다(SCHED-TAB-01b — 의사는 내용 위에 붙는 필터다).
// [SCHED-TAB-01c] 줄마다 부제목에 지금 상태 한 줄 — 들어가 보지 않아도 안이 짐작된다.
// [SCHED-SAVE-02c] 「의사별 스케줄」 줄에도 ●가 붙는다 — 다른 화면을 봐도 어디에 저장 안 한 게 있는지 보인다.

export const RAIL_ITEMS = [
  '전체 현황',
  '진료과 관리',
  '의사별 스케줄',
  '특정 날짜 변경',
  '병원 운영시간',
] as const

export type RailItem = (typeof RAIL_ITEMS)[number]

interface SideRailProps {
  active: RailItem
  onSelect: (item: RailItem) => void
  /** 다섯 줄의 부제목(상태 한 줄), 순서 일치. */
  subtitles: string[]
  /** 저장 안 한 초안이 있으면 「의사별 스케줄」 줄에 ●(SCHED-SAVE-02c). */
  weeklyDirty: boolean
}

export function SideRail({ active, onSelect, subtitles, weeklyDirty }: SideRailProps) {
  return (
    <nav aria-label="일정 관리 화면" style={styles.rail}>
      {RAIL_ITEMS.map((item, i) => {
        const isActive = item === active
        return (
          <button
            key={item}
            type="button"
            data-rail={item}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(item)}
            style={{ ...styles.item, ...(isActive ? styles.itemActive : null) }}
          >
            <span style={styles.itemLabel}>
              {item}
              {item === '의사별 스케줄' && weeklyDirty && <DirtyDot />}
            </span>
            <span data-rail-sub style={styles.itemSub}>
              {subtitles[i] ?? ''}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

const styles: Record<string, CSSProperties> = {
  rail: {
    width: 235,
    flex: '0 0 235px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  colLabel: {
    margin: '0 0 8px',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    color: 'var(--color-ink-muted)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-card)',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'var(--color-ink)',
  },
  itemActive: {
    borderColor: 'var(--color-primary)',
    background: 'var(--color-primary-wash)',
  },
  itemLabel: {
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink)',
    wordBreak: 'keep-all',
  },
  itemSub: {
    fontSize: 'var(--fs-caption)',
    color: 'var(--color-ink-muted)',
    wordBreak: 'keep-all',
    lineHeight: 1.4,
  },
}
