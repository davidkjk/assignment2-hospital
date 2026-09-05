import { describe, it, expect, vi, beforeEach } from 'vitest'
import { qualityAdminApi } from './qualityAdmin'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('qualityAdminApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('[Step1] listUnresolved는 from·to를 싣고 embedding_gap을 카멜로 옮긴다', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ clusters: [{ id: 'c1', representative: '주차', count: 3 }], embedding_gap: true }))
    const r = await qualityAdminApi.listUnresolved({ from: '2026-08-01', to: '2026-08-19' })
    expect(m.mock.calls[0][0]).toBe('/admin/chat/unresolved?from=2026-08-01&to=2026-08-19')
    expect(r).toEqual({ kind: 'clusters', clusters: [{ id: 'c1', representative: '주차', count: 3, lastAt: null }], embeddingGap: true })
  })

  it('[Step1][UNRES-CLUSTER-10] 서버가 집계를 제공하지 않으면(501) no_contract로, 다른 실패는 오류 그대로', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"detail":"n/a"}', { status: 501 }))
    expect(await qualityAdminApi.listUnresolved({ from: 'a', to: 'b' })).toEqual({ kind: 'no_contract' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"detail":"boom"}', { status: 500 }))
    await expect(qualityAdminApi.listUnresolved({ from: 'a', to: 'b' })).rejects.toBeTruthy()
  })

  it('[Step1] listBadInbox는 status를 싣고 snake를 카멜로 옮긴다(기본 pending)', async () => {
    const dto = { id: 'f1', source: 'quality_review', question: '주말', bot_answer: '안 함', correction: '토요일', has_sources: false, status: 'pending', created_at: '2026-08-19T00:00:00Z' }
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([dto]))
    const rows = await qualityAdminApi.listBadInbox()
    expect(m.mock.calls[0][0]).toBe('/admin/chat/feedback?status=pending')
    expect(rows[0]).toMatchObject({ id: 'f1', source: 'quality_review', botAnswer: '안 함', hasSources: false })
  })

  it('[Step1] saveQualityCorrection은 POST .../correct에 correction_text를 싣는다(서버가 source=quality_review로 저장)', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await qualityAdminApi.saveQualityCorrection('s1', '지하 2층')
    expect(m.mock.calls[0][0]).toBe('/admin/chat/quality/s1/correct')
    expect(JSON.parse((m.mock.calls[0][1] as RequestInit).body as string)).toEqual({ correction_text: '지하 2층' })
  })

  it('[Step1] listExamples는 active를 싣고 is_active를 active로 옮긴다', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([{ id: 'e1', question: 'q', answer: 'a', is_active: true }]))
    const rows = await qualityAdminApi.listExamples(true)
    expect(m.mock.calls[0][0]).toBe('/admin/chat/examples?active=true')
    expect(rows[0]).toEqual({ id: 'e1', question: 'q', answer: 'a', active: true })
  })

  it('[다듬기] getFeedbackCounts는 GET /admin/chat/feedback/counts로 status별 건수를 한 번에 가져온다', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ pending: 5, applied: 3, rejected: 1 }))
    const r = await qualityAdminApi.getFeedbackCounts()
    expect(m.mock.calls[0][0]).toBe('/admin/chat/feedback/counts')
    expect(r).toEqual({ pending: 5, applied: 3, rejected: 1 })
  })
})
