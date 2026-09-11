import { useQuery } from '@tanstack/react-query'
import { staffChatApi } from '../../api/staffChat'

// [TICKET-BADGE-01] 사이드바 「상담봇 문의함」 배지 = 처리 대기 중인 **새 문의(미배정 pending) 개수**.
//   사용자 결정(2026-09-11): 사이드바 숫자를 문의함 첫 화면(「새 문의」 탭)과 **같은 값**으로 맞춘다 —
//   예전엔 「내게 배정된 처리 중」이라 새 문의(47)와 안 맞아 헷갈렸다(사이드바 25 vs 본문 47).
//   `listTickets('pending')`을 그대로 세어 탭 정의·권한과 정확히 일치시킨다(별도 카운트 API 없이 일관성 보장).
//   Sidebar는 counts['/tickets']로 배지를 그린다(SHELL-NAV-05: 0이면 사라진다).
// enabled=false면 조회하지 않는다 — 문의함(/tickets)이 없는 역할은 배지 API를 켜지 않는다.
export function useTicketsBadge(enabled = true): Record<string, number> {
  const { data } = useQuery({
    queryKey: ['staff-chat', 'pending-count'],
    queryFn: () => staffChatApi.listTickets('pending').then((rows) => rows.length),
    enabled,
    refetchInterval: 60_000, // 실시간 푸시가 아니므로 주기적으로 다시 센다(문의함 열려 있으면 Realtime이 별도로 갱신).
  })
  return typeof data === 'number' ? { '/tickets': data } : {}
}
