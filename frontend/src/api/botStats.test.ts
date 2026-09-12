import { describe, it, expect, vi, beforeEach } from 'vitest'
import { botStatsApi } from './botStats'

// 전역 fetch만 가짜로 바꾼다 — apiFetch가 실제 ApiError를 던지므로 501→no_contract 변환이 전 구간 산다.
// 대부분의 엔드포인트는 라우터에 없다(소비 계약 선언). 501을 유효한 0건으로 위장하지 않는 것이 핵심.

describe('botStatsApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('[Step1] getRanking은 기간을 쿼리로 실어 GET /admin/chat/stats/ranking을 호출한다', async () => {
    const m = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ kind: 'empty' }), { status: 200 }))
    await botStatsApi.getRanking({ from: '2026-08-01', to: '2026-08-20' })
    expect(String(m.mock.calls[0][0])).toBe('/admin/chat/stats/ranking?from=2026-08-01&to=2026-08-20')
  })

  it('[Step1] 서버가 501을 주면(집계 미제공) no_contract로 소비한다(임의 0건 위장 금지)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 501 }))
    const r = await botStatsApi.getMetrics({ from: 'a', to: 'b' })
    expect(r).toEqual({ kind: 'no_contract' })
  })

  it('[Step1] 지표 응답의 snake_case(self_served·handed_off)를 카멜로 옮겨 화면 계약에 맞춘다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          inflow: { kind: 'value', app: 60, staff: 30, chatbot: 10 },
          inquiries: { kind: 'value', count: 120, drillable: true },
          self_served: { kind: 'value', count: 80, drillable: true },
          handed_off: { kind: 'value', count: 40, drillable: false },
        }),
        { status: 200 },
      ),
    )
    const r = await botStatsApi.getMetrics({ from: 'a', to: 'b' })
    expect(r).toMatchObject({
      selfServed: { kind: 'value', count: 80 },
      handedOff: { kind: 'value', count: 40, drillable: false },
    })
  })
})
