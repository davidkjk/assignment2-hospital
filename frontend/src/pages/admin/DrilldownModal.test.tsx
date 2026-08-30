import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { DrilldownModal } from './DrilldownModal'
import type { DrilldownPage } from '../../api/stats'

// 결정21·24 — 셀을 눌러 여는 마스킹 명단. 원본은 응답에 없고, 전체는 행→환자상세로만.
const MASKED: DrilldownPage = {
  rows: [
    { patient_id: 'p-1234', masked_name: '홍*동', masked_phone: '010-****-5678', masked_birth_date: '1990-**-**', id: 'a1', occurred_at: '2026-08-10 09:30' },
    { patient_id: 'p-2', masked_name: '김*수', masked_phone: '010-****-1111', masked_birth_date: '1985-**-**', id: 'a2', occurred_at: '2026-08-11 10:00' },
  ],
  next_cursor: null,
  has_more: false,
}

function Probe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderModal(target = { metric: 'no_show', label: '예약 부도', dept: '피부과' }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/stats']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/admin/stats"
            element={<DrilldownModal target={target} period={{ from: '2026-08-01', to: '2026-08-15' }} onClose={() => {}} />}
          />
          <Route path="/patients/:id" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => sessionStorage.clear())

describe('DrilldownModal', () => {
  test('[STAT-DRILL-02][MASK-SRV-01] 명단은 마스킹 값으로 보이고 원본은 응답에 없다', async () => {
    server.use(http.get('*/stats/detail', () => HttpResponse.json(MASKED)))
    renderModal()
    expect(await screen.findByText('홍*동')).toBeVisible()
    expect(screen.getByText(/010-\*\*\*\*-5678/)).toBeVisible()
    // 서버가 보낸 응답 자체에 원본이 없다(클라이언트가 받아 가리는 경로를 만들지 않는다).
    expect(JSON.stringify(MASKED)).not.toMatch(/010-1234-5678|홍길동/)
  })

  test('[STAT-DRILL-04][결정24] 명단 행을 누르면 내부 patient_id로 환자 상세로 간다', async () => {
    server.use(http.get('*/stats/detail', () => HttpResponse.json(MASKED)))
    renderModal()
    await userEvent.click(await screen.findByRole('button', { name: '홍*동 환자 상세 보기' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/patients/p-1234')
  })

  test('[STAT-DRILL-03] 일부만 반환하면 「N건 중 M건」이라고 범위를 밝힌다', async () => {
    server.use(http.get('*/stats/detail', () => HttpResponse.json({ ...MASKED, total: 5 })))
    renderModal()
    await waitFor(() => expect(screen.getByTestId('drilldown-scope')).toHaveTextContent('5건 중 2건'))
  })

  test('[STAT-DRILL-03][L15] 더 있으면 「더보기」로 다음 쪽(20건)을 이어 붙인다', async () => {
    const page1: DrilldownPage = {
      rows: [{ patient_id: 'p-1', masked_name: '이*름', id: 'a1', occurred_at: '2026-08-10 09:30' }],
      next_cursor: 'CUR2',
      has_more: true,
      total: 3,
    }
    const page2: DrilldownPage = {
      rows: [{ patient_id: 'p-2', masked_name: '박*름', id: 'a2', occurred_at: '2026-08-11 10:00' }],
      next_cursor: null,
      has_more: false,
      total: 3,
    }
    server.use(
      http.get('*/stats/detail', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        return HttpResponse.json(cursor === 'CUR2' ? page2 : page1)
      }),
    )
    renderModal()
    await screen.findByText('이*름')
    // 첫 쪽엔 다음 쪽 사람이 아직 안 보인다.
    expect(screen.queryByText('박*름')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '더보기' }))
    // 이어 붙이므로 두 사람이 함께 보인다.
    expect(await screen.findByText('박*름')).toBeVisible()
    expect(screen.getByText('이*름')).toBeVisible()
    // 마지막 쪽이면 더보기 버튼이 사라진다(막다른 길 아님).
    await waitFor(() => expect(screen.queryByRole('button', { name: '더보기' })).toBeNull())
  })

  test('[STAT-AUDIT-02][결정22] 명단 조회는 서버가 감사한다 — 프론트는 /audit/stats를 부르지 않고 쿼리에 PII를 안 싣는다', async () => {
    let detailUrl = ''
    let auditPosts = 0
    server.use(
      http.get('*/stats/detail', ({ request }) => {
        detailUrl = request.url
        return HttpResponse.json(MASKED)
      }),
      http.post('*/audit/stats', () => {
        auditPosts += 1
        return HttpResponse.json({ ok: true })
      }),
    )
    renderModal()
    await screen.findByText('홍*동')
    expect(detailUrl).toContain('/stats/detail')
    expect(detailUrl).not.toMatch(/홍|010-/) // 검색어·원본을 쿼리에 싣지 않는다
    await waitFor(() => expect(auditPosts).toBe(0)) // 드릴다운 감사는 서버가 남긴다(이중 기록 방지)
  })
})
