import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { AccessLogPage } from './AccessLogPage'
import type { AccessLogRow } from '../../api/accessLogs'

const P1 = { patient_id: 'p1', name: '홍*동', masked_birth_date: '1985-**-01', masked_phone: '010-****-5678' }

function detail(i: number): AccessLogRow {
  return {
    id: `r${i}`,
    accessed_at: '2026-08-15T09:41:07+09:00',
    resource_type: 'patient_detail',
    search_term: null,
    staff_name: '김영희',
    patient: P1,
  }
}

/** 첫 페이지 200건(next_cursor='c1') → 이어보기 200건(next_cursor=null)로 400건을 만든다. */
function pagedOk() {
  server.use(
    http.get('*/admin/access-logs', ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor')
      if (cursor === 'c1') {
        const rows = Array.from({ length: 200 }, (_, i) => detail(200 + i))
        return HttpResponse.json({ rows, next_cursor: null, total_hint: 400 })
      }
      const rows = Array.from({ length: 200 }, (_, i) => detail(i))
      return HttpResponse.json({ rows, next_cursor: 'c1', total_hint: 400 })
    }),
  )
}

function okWith(rows: AccessLogRow[], total_hint = rows.length) {
  server.use(http.get('*/admin/access-logs', () => HttpResponse.json({ rows, next_cursor: null, total_hint })))
}

function renderPage(initialEntry = '/admin/access-logs') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/access-logs" element={<AccessLogPage />} />
          <Route path="/today" element={<div>오늘의 현황 화면</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => sessionStorage.clear())

describe('AccessLogPage /admin/access-logs', () => {
  test('[ALOG-HEAD-01] 제목과 설명이 화면의 목적을 넓히지 않는다', async () => {
    okWith([detail(0)])
    renderPage()
    // 제목은 셸 헤더가 그린다(STAFF-SHELL-02) · 설명글은 제거됨(2026-08-30) — 로드 확인은 읽기전용 고지로.
    expect(screen.queryByRole('heading', { name: '환자정보 열람 기록' })).toBeNull()
    expect(screen.queryByText('누가 어떤 환자 정보를 언제 열었는지 확인합니다')).toBeNull()
    expect(screen.getByText('이 기록은 삭제하거나 수정할 수 없습니다')).toBeVisible()
    expect(screen.queryByText(/직원 활동 통계|환자 상세/)).toBeNull()
  })

  test('[ALOG-HEAD-02] 읽기 전용 고지가 표 위에 있고, 행에 편집·삭제·되돌리기가 없다', async () => {
    okWith([detail(0)])
    renderPage()
    expect(screen.getByText('이 기록은 삭제하거나 수정할 수 없습니다')).toBeVisible()
    // 부제 설명 — 무엇이 어떻게 적히는지(검색 1줄·번호열람 별도·200건)
    expect(screen.getByText(/검색은 실행 1회당 한 줄.*번호 보기는.*별도로 기록.*최대 200건/)).toBeVisible()
    await screen.findByText('2026.08.15 09:41:07')
    expect(screen.queryByRole('button', { name: /삭제|수정|되돌리기/ })).toBeNull()
  })

  test('[결정3] 이 화면을 여는 것 자체는 감사 행(POST)을 만들지 않는다', async () => {
    okWith([detail(0)])
    let audits = 0
    server.use(http.post('*/audit/*', () => { audits += 1; return HttpResponse.json({ ok: true }) }))
    renderPage()
    await screen.findByText('2026.08.15 09:41:07')
    expect(audits).toBe(0)
  })

  test('[ALOG-FILTER-01][ALOG-LIST-09] 최초에는 필터 없이 최신 200건이고 「최근 200건」을 밝힌다', async () => {
    let url = ''
    server.use(http.get('*/admin/access-logs', ({ request }) => {
      url = request.url
      return HttpResponse.json({ rows: [detail(0)], next_cursor: null, total_hint: 1204 })
    }))
    renderPage()
    expect(await screen.findByText('최근 200건')).toBeVisible()
    const q = new URL(url).searchParams
    expect(q.get('patient_id')).toBeNull()
    expect(q.get('from')).toBeNull()
    expect(q.get('cursor')).toBeNull()
  })

  test('[ALOG-STATE-01] 로딩 중엔 표 머리를 유지하고 skeleton 4행을 보이며 환자 행을 안 섞는다', async () => {
    server.use(http.get('*/admin/access-logs', async () => {
      await delay(80)
      return HttpResponse.json({ rows: [detail(0)], next_cursor: null, total_hint: 1 })
    }))
    renderPage()
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(4)
    expect(screen.getByText('기록을 불러오는 중입니다')).toBeVisible()
    expect(screen.queryByText('홍*동 · 1985-**-01')).toBeNull()
  })

  test('[ALOG-STATE-02] 조회 실패는 같은 화면 안에서 재시도하고 화면을 떠나지 않는다', async () => {
    server.use(http.get('*/admin/access-logs', () => new HttpResponse(null, { status: 500 })))
    renderPage()
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.getByRole('link', { name: '오늘의 현황으로 가기' })).toBeVisible()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('[ALOG-STATE-03] 오프라인에선 캐시된 감사 로그를 보여주지 않고 나갈 길을 준다', async () => {
    server.use(http.get('*/admin/access-logs', () => HttpResponse.error()))
    renderPage()
    expect(await screen.findByText('인터넷이 연결되어 있지 않습니다')).toBeVisible()
    expect(screen.getByText('연결되면 열람 기록을 볼 수 있습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('[ALOG-STATE-06] 전체 0건은 실패가 아니므로 [다시 시도] 없이 사실만 알린다', async () => {
    okWith([], 0)
    renderPage()
    expect(await screen.findByText('아직 환자정보 열람 기록이 없습니다')).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  test('[ALOG-LIST-11] 필터 0건은 다른 환자·전체로 돌아갈 길을 주고 [다시 시도]를 두지 않는다', async () => {
    server.use(http.get('*/admin/access-logs', () => HttpResponse.json({ rows: [], next_cursor: null, total_hint: 0 })))
    renderPage('/admin/access-logs?patient_id=p1')
    expect(await screen.findByText('이 환자의 접근 기록이 없습니다')).toBeVisible()
    expect(screen.getByText('다른 환자를 선택하거나 전체 기록으로 돌아가세요')).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  test('[ALOG-FILTER-06][ALOG-LIST-08] 200건 이후는 cursor로 이어보고 겹치지 않는 400건이 된다', async () => {
    pagedOk()
    renderPage()
    await screen.findByText('더 보기')
    expect(screen.getAllByTestId('log-row')).toHaveLength(200)
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }))
    await waitFor(() => expect(screen.getAllByTestId('log-row')).toHaveLength(400))
    const ids = screen.getAllByTestId('log-row').map((r) => r.getAttribute('data-resource'))
    expect(ids).toHaveLength(400)
  })
})
