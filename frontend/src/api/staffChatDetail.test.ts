import { it, expect, vi, beforeEach } from 'vitest'
import { staffChatDetailApi, TicketNotFound } from './staffChatDetail'
import { TicketClaimConflict } from './staffChat'

// 실제 apiFetch를 지나 fetch만 가짜로 세운다 — 오류 승격(ApiError→전용 예외) 매핑을 진짜로 검증한다.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
beforeEach(() => vi.restoreAllMocks())

it('[Step1] sendMessage는 content+client_message_id(멱등 키)를 실어 POST .../messages한다', async () => {
  const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'm1', sender: 'staff', body: '안녕하세요', at: '09:00', patient_read: false, staff_unread: false, sms_sent: false }))
  await staffChatDetailApi.sendMessage('t1', '안녕하세요', 'req-1')
  expect(m.mock.calls[0][0]).toBe('/staff/chat/tickets/t1/messages')
  expect(JSON.parse((m.mock.calls[0][1] as RequestInit).body as string)).toEqual({ content: '안녕하세요', client_message_id: 'req-1' })
})

it('[Step1] getDetail이 404면 TicketNotFound로 reject한다(딥링크 방어)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: '없음' }, 404))
  await expect(staffChatDetailApi.getDetail('nope')).rejects.toBeInstanceOf(TicketNotFound)
})

it('[Step1] getDetail이 403이어도 TicketNotFound로 reject한다(권한 없는 티켓도 내용 노출 안 함)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: '권한 없음' }, 403))
  await expect(staffChatDetailApi.getDetail('x')).rejects.toBeInstanceOf(TicketNotFound)
})

it('[Step1] claim이 409면 TicketClaimConflict로 reject한다(딥링크 경쟁 패자)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: '이미 다른 직원이 맡았어요.' }, 409))
  await expect(staffChatDetailApi.claim('t1')).rejects.toBeInstanceOf(TicketClaimConflict)
})

it('[Step1] reassignTicket은 to_staff_id를 실어 POST .../reassign한다', async () => {
  const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 't1', status: 'in_progress', reason: 'general', assignee: null, is_mine: true, summary: { patient_asked: null, bot_confirmed: null, already_guided: null, unresolved_reason: null, staff_should_check: null }, messages: [], contact: { anonymous: false, has_phone: false } }))
  await staffChatDetailApi.reassignTicket('t1', 's9')
  expect(m.mock.calls[0][0]).toBe('/staff/chat/tickets/t1/reassign')
  expect(JSON.parse((m.mock.calls[0][1] as RequestInit).body as string)).toEqual({ to_staff_id: 's9' })
})

it('[Step1] getDetail은 서버 snake 응답을 카멜 TicketDetail로 옮긴다(is_mine·summary·contact·sender)', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
    id: 't1', status: 'in_progress', reason: 'medical_judgment', assignee: { name: '박접수', role: 'reception' }, is_mine: true,
    summary: { patient_asked: '두통약', bot_confirmed: null, already_guided: null, unresolved_reason: '진단·치료 판단이 필요합니다', staff_should_check: null },
    messages: [{ id: 'm1', sender: 'ai', body: '안내', at: '09:01', patient_read: false, staff_unread: false, sms_sent: false }],
    contact: { anonymous: true, has_phone: true },
  }))
  const d = await staffChatDetailApi.getDetail('t1')
  expect(d.isMine).toBe(true)
  expect(d.summary.patientAsked).toBe('두통약')
  expect(d.summary.unresolvedReason).toBe('진단·치료 판단이 필요합니다')
  expect(d.contact.hasPhone).toBe(true)
  expect(d.messages[0].sender).toBe('ai')
})
