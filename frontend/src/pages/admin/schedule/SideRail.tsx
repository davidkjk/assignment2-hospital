import type { CSSProperties } from 'react'
import { DirtyDot } from './DirtyDot'

// [SCHED-TAB-01] 왼쪽 세로줄 다섯 줄 + 오른쪽 내용. ⭐ 세로줄에 놓는 것은 「무슨 일을 하는 곳인가」이지
//   「누구의 것인가」가 아니다(SCHED-TAB-01b — 의사는 내용 위에 붙는 필터다).
// [SCHED-TAB-01c] 줄마다 부제목에 지금 상태 한 줄 — 들어가 보지 않아도 안이 짐작된다.
//   전체 진료 일정엔 부제목을 두지 않고(빈 칸), 병원 운영시간은 휴무일만 보여 준다(사용자 지시).
// [SCHED-SAVE-02c] 「의사별 스케줄」 줄에도 ●가 붙는다 — 다른 화면을 봐도 어디에 저장 안 한 게 있는지 보인다.

export const RAIL_ITEMS = [
  '전체 진료 일정',
  '진료과 관리',
  '의사별 스케줄',
  '특정 날짜 변경',
  '병원 운영시간',
] as const

export type RailItem = (typeof RAIL_ITEMS)[number]

interface SideRailProps {
  active: RailItem
  onSelect: (item: RailItem) => void
  /** 다섯 줄의 부제목(상태 한 줄), 순서 일치. 빈 문자열이면 그 줄엔 부제목을 그리지 않는다. */
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
            {subtitles[i] ? (
              <span data-rail-sub style={styles.itemSub}>
                {subtitles[i]}
              </span>
            ) : null}
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
    gap: 'var(--sp-2)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 'var(--sp-0-5)',
    width: '100%',
    minHeight: 58, // 다섯 줄 카드 높이를 똑같이 — 부제목 없는 「전체 진료 일정」도 같은 크기(사용자 지시)
    padding: 'var(--sp-3) var(--sp-3)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-card)',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'var(--color-ink)',
  },
  itemActive: {
    border: '1px solid var(--color-primary)',
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
    lineHeight: 1.4,
    // 늘 한 줄 — 부제목이 길어도 카드가 다른 카드보다 커지지 않게(사용자 지시).
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
