import { describe, it, expect, vi, beforeEach } from 'vitest'
import { badReportApi } from './badReport'

describe('badReportApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('[Step1] reportBadAnswer는 POST /staff/chat/feedback로 source=realtime_report를 보낸다(품질 교정과 출처 구분)', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'f1' }), { status: 200 }))
    await badReportApi.reportBadAnswer({ messageId: 'msg1', correctionText: '예약은 앱에서', addToExampleBank: true })
    expect(m.mock.calls[0][0]).toBe('/staff/chat/feedback')
    const body = JSON.parse((m.mock.calls[0][1] as RequestInit).body as string)
    expect(body.source).toBe('realtime_report')
    expect(body.add_to_example_bank).toBe(true)
    expect(body.message_id).toBe('msg1')
  })

  it('[Step1] getTargetMessage는 대상 메시지를 GET하고 role을 그대로 전달한다(봇 여부 판단 근거)', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'msg1', role: 'bot', content: '전화로만' }), { status: 200 }))
    const t = await badReportApi.getTargetMessage('msg1')
    expect(m.mock.calls[0][0]).toBe('/staff/chat/messages/msg1')
    expect(t).toEqual({ id: 'msg1', role: 'bot', content: '전화로만' })
  })
})
