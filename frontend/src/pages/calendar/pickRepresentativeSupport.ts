import type { TicketStatus } from '../../api/staffChat'

// SUPPORT-CAL-DUP-01 — 대표 ⚠ 선정 순수함수.
//   Task 2 티켓 모델이 확정한 값을 렌더 가능하게 만든다: 대표 = 열린 티켓(pending|in_progress)
//   → 없으면 가장 최근 answered. ⚠는 대표 하나만, count는 같은 예약에 붙은 상담 기록 수(패널 "상담 N건").
//   ⭐ ⑦ 서버(get_appointment_detail의 SQL)도 같은 규칙을 쓴다 — 두 곳이 갈리지 않게 규칙이 하나다.

export type DupTicket = { ticketId: string; status: TicketStatus; createdAt: string }
export type Representative = { ticketId: string; status: TicketStatus; count: number } | null

export function pickRepresentativeSupport(tickets: DupTicket[]): Representative {
  if (tickets.length === 0) return null
  const open = tickets.filter((t) => t.status === 'pending' || t.status === 'in_progress')
  const rep =
    open.length > 0
      ? open[0] // 열린 티켓(idx_tickets_one_open으로 thread당 하나 보장)
      : [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] // 가장 최근 answered
  return { ticketId: rep.ticketId, status: rep.status, count: tickets.length }
}
