import { describe, it, expect, vi, beforeEach } from 'vitest'
import { staffChatApi, TicketClaimConflict } from './staffChat'

// 전역 fetch만 가짜로 바꾼다 — apiFetch가 실제 ApiError를 던지므로 instanceof가 전 구간 산다.
// (supabase 세션 첨부는 실패해도 authHeader가 {}로 삼켜 네트워크를 타지 않는다.)

const dto = {
  id: 't1',
  status: 'pending',
  patient_question: '두통이 심해요',
  handoff_reason: '약 정보',
  created_at: '2026-08-19T08:00',
  assignee_name: null,
  is_mine: true,
  request_type: null,
  appointment_summary: null,
}

describe('staffChatApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('[Step1] listTickets는 상태 쿼리로 GET하고 snake_case를 카멜로 옮긴다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))
    const rows = await staffChatApi.listTickets('pending')
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/tickets?status=pending')
    expect(rows[0]).toMatchObject({
      id: 't1',
      patientQuestion: '두통이 심해요',
      handoffReason: '약 정보',
      assigneeName: null,
      isMine: true, // 이관 알림: is_mine → isMine
    })
  })

  it('[이관알림] myActiveTicketCount는 my-count를 GET해 개수를 돌려준다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ count: 3 }), { status: 200 }))
    expect(await staffChatApi.myActiveTicketCount()).toBe(3)
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/tickets/my-count')
  })

  it('[Step1] claimTicket은 409면 TicketClaimConflict로 승격한다(경쟁 패자)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 409 }))
    await expect(staffChatApi.claimTicket('t1')).rejects.toBeInstanceOf(TicketClaimConflict)
  })

  it('[Step1] claimTicket은 409가 아닌 오류는 그대로 던진다(승패로 오인 금지)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    await expect(staffChatApi.claimTicket('t1')).rejects.not.toBeInstanceOf(TicketClaimConflict)
  })
})
