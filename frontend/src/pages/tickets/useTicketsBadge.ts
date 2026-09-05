import { useQuery } from '@tanstack/react-query'
import { staffChatApi } from '../../api/staffChat'

// 이관 알림(REASSIGN-NOTIFY-*) — 사이드바 「상담봇 문의함」 배지 = 내게 배정된 진행 중 상담 개수.
//   이관은 별도 알림을 만들지 않으므로(reassign_ticket), 이 개수가 늘면 어느 화면에서든 「내게 온 상담」을 인지한다.
//   Sidebar는 counts['/tickets']로 배지를 그린다(SHELL-NAV-05: 0이면 사라진다).
// enabled=false면 조회하지 않는다 — 문의함(/tickets)이 없는 역할은 배지 API를 켜지 않는다.
export function useTicketsBadge(enabled = true): Record<string, number> {
  const { data } = useQuery({
    queryKey: ['staff-chat', 'my-active-count'],
    queryFn: () => staffChatApi.myActiveTicketCount(),
    enabled,
    refetchInterval: 60_000, // 이관은 실시간 푸시가 아니므로 주기적으로 다시 센다.
  })
  return typeof data === 'number' ? { '/tickets': data } : {}
}
