import { describe, it, expect, vi, beforeEach } from 'vitest'
import { staffChatLogApi } from './staffChatLog'

// 전역 fetch만 가짜로 바꾼다 — apiFetch가 실제 ApiError를 던지므로 instanceof가 전 구간 산다.

describe('staffChatLogApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('[Step1][CHATLOG-LIST] listLogs는 channel·route_taken을 쿼리로 실어 GET하고 snake를 카멜로 옮긴다', async () => {
    const dto = { thread_id: 'th1', channel: 'web', route_taken: 'rag', summary: '두통', at: '2026-08-19T00:00:00Z' }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))
    const rows = await staffChatLogApi.listLogs({ channel: 'web', routeTaken: 'rag' })
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/logs?channel=web&route_taken=rag')
    expect(rows[0]).toMatchObject({ threadId: 'th1', channel: 'web', routeTaken: 'rag', summary: '두통' })
  })

  it('[Step1][CHATLOG-LIST] listLogs는 필터가 없으면 쿼리 없이 전체를 조회한다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
    await staffChatLogApi.listLogs({})
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/logs')
  })

  it('[CHATLOG-LIST] listLogs는 기간(from·to)도 쿼리로 싣는다', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
    await staffChatLogApi.listLogs({ channel: 'app', from: '2026-08-16', to: '2026-08-22' })
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/logs?channel=app&from=2026-08-16&to=2026-08-22')
  })

  it('[CHATLOG-LIST] listCounts는 채널·기간만 싣고(갈래 없음) total·counts를 받는다', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ total: 5, counts: { handoff: 2 } }), { status: 200 }))
    const c = await staffChatLogApi.listCounts({ channel: 'web', from: '2026-08-16' })
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/logs/counts?channel=web&from=2026-08-16')
    expect(c).toEqual({ total: 5, counts: { handoff: 2 } })
  })

  it('[Step1][CHATLOG-LIST] listSources는 message id로 근거 스냅샷을 GET하고 카멜로 옮긴다', async () => {
    const dto = { rank: 1, similarity: 0.82, title_snapshot: '주차 안내', body_snapshot: '지하 2층' }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))
    const rows = await staffChatLogApi.listSources('m1')
    expect(fetchMock.mock.calls[0][0]).toBe('/staff/chat/messages/m1/sources')
    expect(rows[0]).toMatchObject({ rank: 1, similarity: 0.82, titleSnapshot: '주차 안내', bodySnapshot: '지하 2층' })
  })
})
