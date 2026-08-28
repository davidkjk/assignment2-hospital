import { useQuery } from '@tanstack/react-query'
import { getBadgeCount } from '../../api/messages'

// [Task 30][SEND-BADGE-01] 사이드바 「안내 보내기」 배지 — 전화해야 할 미처리 실패 건수.
//   Sidebar는 counts[item.path]로 배지를 그린다(SHELL-NAV-05: 0이면 사라진다).
//   ⛔ navItems·AppShell 배선은 코디 몫 — 이 훅이 { '/messages': n } 조각을 만들어 준다.
//   처리 표시(mark-handled)로 배지가 줄므로, 처리 후 이 쿼리를 invalidate 하면 반영된다.
// enabled=false면 조회하지 않는다 — 의사는 「안내 보내기」 항목이 없고 배지 API가 403이라 켜지 않는다.
export function useMessagesBadge(enabled = true): Record<string, number> {
  const { data } = useQuery({
    queryKey: ['messages', 'badge-count'],
    queryFn: () => getBadgeCount(),
    enabled,
    refetchInterval: 60_000, // 발송 결과는 콜백으로 늦게 들어오므로 주기적으로 다시 센다.
  })
  return data ? { '/messages': data.count } : {}
}
