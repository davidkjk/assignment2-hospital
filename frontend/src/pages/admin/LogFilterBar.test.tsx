import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { AccessLogPage } from './AccessLogPage'
import type { AccessLogRow } from '../../api/accessLogs'

const P1 = { patient_id: 'p1', masked_name: '홍*동', masked_birth_date: '1985-**-01', masked_phone: '010-****-5678' }

function detail(id: string, patient = P1): AccessLogRow {
  return { id, accessed_at: '2026-08-15T09:41:07+09:00', resource_type: 'patient_detail', search_term: null, staff_name: '김영희', patient }
}

let lastUrl = ''

/** 전체=1,204건, 환자 p1=12건. searchPatients는 마스킹 식별자만 준다. */
function wireServer() {
  lastUrl = ''
  server.use(
    http.get('*/patients', () => HttpResponse.json([P1])),
    http.get('*/admin/access-logs', ({ request }) => {
      lastUrl = request.url
      const q = new URL(request.url).searchParams
      if (q.get('patient_id') === 'p1') return HttpResponse.json({ rows: [detail('r0')], next_cursor: null, total_hint: 12 })
      return HttpResponse.json({ rows: [detail('r0')], next_cursor: null, total_hint: 1204 })
    }),
  )
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderPage(initialEntry = '/admin/access-logs') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/access-logs" element={<><AccessLogPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const loc = () => screen.getByTestId('loc').textContent ?? ''

beforeEach(() => { sessionStorage.clear(); wireServer() })

describe('LogFilterBar — 환자·URL·기간 (ALOG-FILTER-*)', () => {
  test('[ALOG-FILTER-02] 환자 찾기 결과를 patient_id 필터로 연결하고 검색·마스킹은 원본 규칙을 쓴다', async () => {
    renderPage()
    await screen.findByText('최근 200건')
    await userEvent.type(screen.getByLabelText('환자 찾기'), '010-1234')
    await userEvent.click(await screen.findByText('홍*동'))
    await waitFor(() => expect(new URL(lastUrl).searchParams.get('patient_id')).toBe('p1'))
  })

  test('[ALOG-FILTER-03] 필터 칩에 마스킹 식별자가 남고 전체·필터 결과 수를 구분해 보인다', async () => {
    renderPage()
    await screen.findByText('최근 200건')
    await userEvent.type(screen.getByLabelText('환자 찾기'), '010-1234')
    await userEvent.click(await screen.findByText('홍*동'))
    expect(await screen.findByTestId('filter-chip')).toHaveTextContent('환자: 홍*동 · 1985-**-01 · 010-****-5678')
    await waitFor(() => expect(screen.getByTestId('filter-count')).toHaveTextContent('전체 1,204건 중 이 환자 12건'))
    expect(screen.getByRole('button', { name: '필터 지우기' })).toBeVisible()
  })

  test('[ALOG-FILTER-04] URL에는 patient_id만 남기고 이름·전화 원문을 넣지 않는다', async () => {
    renderPage()
    await screen.findByText('최근 200건')
    await userEvent.type(screen.getByLabelText('환자 찾기'), '010-1234')
    await userEvent.click(await screen.findByText('홍*동'))
    await waitFor(() => expect(loc()).toBe('/admin/access-logs?patient_id=p1'))
    expect(loc()).not.toMatch(/홍|010-/)
  })

  test('[ALOG-FILTER-04] 새로고침(직접 URL 진입)에도 patient_id로 칩을 복원한다', async () => {
    renderPage('/admin/access-logs?patient_id=p1')
    // 칩은 즉시 뜨고(patient_id 확보), 마스킹 신원은 행이 로드되며 채워진다.
    await waitFor(() => expect(screen.getByTestId('filter-chip')).toHaveTextContent('홍*동'))
  })

  test('[ALOG-FILTER-05] [필터 지우기]는 같은 화면에서 전체 최신 200건으로 돌아온다', async () => {
    renderPage('/admin/access-logs?patient_id=p1')
    await screen.findByTestId('filter-chip')
    await userEvent.click(screen.getByRole('button', { name: '필터 지우기' }))
    await waitFor(() => expect(loc()).toBe('/admin/access-logs'))
    await waitFor(() => expect(new URL(lastUrl).searchParams.get('patient_id')).toBeNull())
    expect(await screen.findByText('최근 200건')).toBeVisible()
  })

  test('[ALOG-FILTER-07][결정 4회차] 기간 조회는 from 포함·to 제외이고 결과에 조회 기간을 적는다', async () => {
    renderPage()
    await screen.findByText('최근 200건')
    const start = screen.getByLabelText('시작일')
    const end = screen.getByLabelText('종료일')
    await userEvent.clear(start); await userEvent.type(start, '2026-07-01')
    await userEvent.clear(end); await userEvent.type(end, '2026-08-01')
    await userEvent.click(screen.getByRole('button', { name: '기간 조회' }))
    await waitFor(() => {
      const q = new URL(lastUrl).searchParams
      expect(q.get('from')).toBe('2026-07-01T00:00:00+09:00')
      expect(q.get('to')).toBe('2026-08-01T00:00:00+09:00')
    })
    expect(screen.getByText('2026년 7월 기록을 보고 있습니다')).toBeVisible()
  })
})
