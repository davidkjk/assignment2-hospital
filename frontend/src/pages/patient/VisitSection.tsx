import { useCallback, type CSSProperties, type UIEvent } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { History } from '../../components/icons'
import type { PatientHistoryRow } from '../../api/patients'
import type { SectionState } from './format'
import { mdHm } from './format'
import { SectionHead } from './SectionHead'

// 카드 안 목록을 끝까지 내리면 다음 쪽이 자동으로 이어 붙는다(2026-08-31 손검수 ⑥) — [더 보기] 버튼을 두지 않는다.
const NEAR_BOTTOM_PX = 96

// [PTDET-VISIT-01~08] 앞으로의 예약과 지난 예약을 한 섹션에서. 취소·부도도 기록이므로 숨기지 않고,
//   책망하지 않는 중립 문구로 적는다(VISIT-05). 상태는 색이 아니라 글자로(DISP-COLOR-01).

export interface VisitData {
  rows: PatientHistoryRow[]
  hasMore: boolean
}

interface VisitSectionProps {
  state: SectionState<VisitData>
  onMore: () => void
  moreLoading?: boolean
}

// 진행 중인 예약은 상단 카드와 같은 서버 상태를 「현재」로 표시한다(VISIT-04).
const ACTIVE = new Set(['도착', '진료대기', '진료중'])
// 취소·부도는 중립 문구로 — 무단/불참/안 오셨 같은 책망 표현을 쓰지 않는다(VISIT-05).
const STATUS_TEXT: Record<string, string> = {
  예약부도: '예약 부도',
  병원취소: '병원 취소',
  환자취소: '환자 취소',
}

function statusText(s?: string): string {
  if (!s) return ''
  return STATUS_TEXT[s] ?? s
}

export function VisitSection({ state, onMore, moreLoading }: VisitSectionProps) {
  const rows = state.data?.rows ?? []
  const hasMore = state.data?.hasMore ?? false
  // [PTDET-VISIT-07] 카드 안 스크롤이 바닥에 닿으면 다음 쪽을 부른다(무한스크롤, 검색 목록과 같은 손맛).
  const onScroll = useCallback(
    (e: UIEvent<HTMLUListElement>) => {
      if (!hasMore || moreLoading) return
      const el = e.currentTarget
      if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX) onMore()
    },
    [hasMore, moreLoading, onMore],
  )
  return (
    <section aria-label="예약·방문 이력" style={styles.section}>
      <SectionHead icon={<History className="h-4 w-4" />} title="예약·방문 이력" count={rows.length} />
      {state.loading ? (
        <div data-testid="skeleton" aria-hidden="true" style={styles.skeleton} />
      ) : state.error ? (
        <EmptyState kind="error" onRetry={state.retry} />
      ) : rows.length === 0 ? (
        // [VISIT-06] 빈 자리를 채우려고 새 예약 버튼을 여기에 또 만들지 않는다(셸에 있다).
        <EmptyState kind="zero" message="예약·방문 이력이 없습니다" />
      ) : (
        <>
          <ul style={styles.list} onScroll={onScroll}>
            {rows.map((r) => (
              <li key={r.id} data-id={r.id} style={styles.row}>
                <span style={styles.when}>{mdHm(r.occurred_at)}</span>
                {(r.department_name || r.doctor_name) && (
                  <span style={styles.where}>
                    {[r.department_name, r.doctor_name].filter(Boolean).join(' · ')}
                  </span>
                )}
                {ACTIVE.has(r.status ?? '') && <span style={styles.nowBadge}>현재</span>}
                <span style={styles.status}>{statusText(r.status)}</span>
              </li>
            ))}
            {/* 이어받기 꼬리 한 줄 — 스크롤로 다음 쪽을 부르는 동안만 보인다(막다른 길 아님). */}
            {moreLoading && <li style={styles.moreNote}>◌ 불러오는 중…</li>}
          </ul>
        </>
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    padding: 'var(--sp-4)', background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  skeleton: { height: 96, borderRadius: 6, background: 'var(--color-bg)' },
  // [PTDET-VISIT-07] 이력이 길어도 카드가 한없이 늘어나지 않게 — 상한을 넘으면 카드 안에서 스크롤한다.
  //   9행쯤 보이고 그 아래는 스크롤. 짧으면 자동으로 그 높이라 빈 칸이 생기지 않는다(오른쪽 사전문진과 균형).
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: 396, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 40,
    padding: 'var(--sp-2) 0', borderTop: '1px solid var(--color-divider)',
  },
  when: { fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums', minWidth: 92 },
  where: { fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  nowBadge: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-primary)',
    background: 'var(--color-primary-wash)', borderRadius: 6, padding: '1px var(--sp-2)',
  },
  // 상태는 색이 아니라 글자로(DISP-COLOR-01) — 담백한 회색 pill로 정돈한다. 색은 「현재」 배지에만 아껴 쓴다.
  status: {
    marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink-muted)', background: 'var(--color-bg)', border: '1px solid var(--color-divider)',
    borderRadius: 6, padding: '1px var(--sp-2)',
  },
  moreNote: { padding: 'var(--sp-2) 0', textAlign: 'center', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
