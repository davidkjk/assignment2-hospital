import type { CSSProperties } from 'react'
import { useConnectivity } from '../lib/connectivity'

// 연결이 끊기면 화면 맨 위에 고정된 띠로 알린다(`OFFX-STAFF-01·02`).
// - 판정은 오직 useConnectivity 한 곳에서 온다 — 배너는 스스로 연결을 재판정하지 않는다.
// - 마지막으로 **서버에서 확인한 절대 시각**을 함께 보인다("방금"·"몇 분 전" 아님).
// - 서버 응답이 한 번도 없으면 낡은 시각을 지어내지 않고 시각 표시를 아예 걸지 않는다.
//   (그 화면의 EMPTY-OFF-01 안내는 EmptyState가 그린다 — 배너는 낡음 표시만 얹는다.)

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true })

export function OfflineBanner() {
  const { online, lastServerOkAt } = useConnectivity()
  if (online) return null
  return (
    <div role="status" style={styles.banner}>
      <span style={styles.dot} aria-hidden="true" />
      <span>인터넷이 연결되어 있지 않습니다</span>
      {lastServerOkAt && (
        <span style={styles.at}>{timeFormat.format(lastServerOkAt)} 기준</span>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  banner: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    background: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    borderBottom: '1px solid var(--color-divider)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--color-danger)',
    flex: '0 0 auto',
  },
  at: {
    marginLeft: 'auto',
    color: 'var(--color-ink-muted)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
}
