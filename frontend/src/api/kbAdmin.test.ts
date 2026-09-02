import { describe, it, expect, vi, beforeEach } from 'vitest'
import { kbAdminApi } from './kbAdmin'

// 전역 fetch만 가짜로 바꾼다 — apiFetch가 실제 ApiError를 던지므로 instanceof가 전 구간 산다.

const docDto = {
  id: 'd1',
  title: '주차 안내',
  category: '위치·주차',
  status: 'approved',
  is_restricted: false,
  has_pending_edit: false,
}

describe('kbAdminApi', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('[Step1] submitEdit는 PUT으로 보내 pending에 담는다(승인 전 비공개 — 라이브 안 바꿈)', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await kbAdminApi.submitEdit('d1', { title: '주차', content: '지하2층', isRestricted: false })
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb/d1')
    expect((m.mock.calls[0][1] as RequestInit).method).toBe('PUT')
  })

  it('[Step1] listDocs는 category·status를 쿼리로 실어 GET하고 snake를 카멜로 옮긴다', async () => {
    const m = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([docDto]), { status: 200 }))
    const rows = await kbAdminApi.listDocs({ category: '위치·주차', status: 'approved' })
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb?category=%EC%9C%84%EC%B9%98%C2%B7%EC%A3%BC%EC%B0%A8&status=approved')
    expect(rows[0]).toMatchObject({ id: 'd1', isRestricted: false, hasPendingEdit: false, status: 'approved' })
  })

  it('[Step1] listDocs는 필터가 없으면 쿼리 없이 전체를 조회한다', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }))
    await kbAdminApi.listDocs({})
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb')
  })

  it('[Step1] getDoc은 상세를 GET하고 pending_* 를 카멜로 옮긴다(대기 수정본 노출)', async () => {
    const detailDto = { ...docDto, has_pending_edit: true, content: '지하 2층', pending_title: '주차 안내(수정)', pending_content: '지하 3층' }
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(detailDto), { status: 200 }))
    const d = await kbAdminApi.getDoc('d1')
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb/d1')
    expect(d).toMatchObject({ content: '지하 2층', pendingTitle: '주차 안내(수정)', pendingContent: '지하 3층', hasPendingEdit: true })
  })

  it('[Step1] approveDoc은 POST .../approve로 재임베딩 트랜잭션을 호출한다', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await kbAdminApi.approveDoc('d1')
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb/d1/approve')
    expect((m.mock.calls[0][1] as RequestInit).method).toBe('POST')
  })

  it('[Step1] rejectEdit·archiveDoc은 각각 POST .../reject·.../archive를 호출한다', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('', { status: 200 })))
    await kbAdminApi.rejectEdit('d1')
    await kbAdminApi.archiveDoc('d1')
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb/d1/reject')
    expect(m.mock.calls[1][0]).toBe('/admin/chat/kb/d1/archive')
  })

  it('[Step1] listRevisions는 이력을 GET하고 approved_by null을 보존한다(지어내지 않음)', async () => {
    const revDto = { id: 'r1', at: '2026-08-19T00:00:00Z', title: '주차 안내', content: '지하 2층', approved_by: null }
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([revDto]), { status: 200 }))
    const rows = await kbAdminApi.listRevisions('d1')
    expect(m.mock.calls[0][0]).toBe('/admin/chat/kb/d1/revisions')
    expect(rows[0]).toMatchObject({ id: 'r1', approvedBy: null })
  })
})
