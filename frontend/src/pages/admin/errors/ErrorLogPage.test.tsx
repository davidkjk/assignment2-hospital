import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { server } from '../../../test/msw/server'
import { ErrorLogPage } from './ErrorLogPage'
import type { ErrorLogRow } from '../../../api/errorLogs'

function row(over: Partial<ErrorLogRow> = {}): ErrorLogRow {
  return {
    id: over.id ?? 'e1',
    occurred_at: over.occurred_at ?? '2026-08-17T09:41:07+09:00',
    feature: over.feature ?? '예약 조회',
    summary: over.summary ?? '예약을 불러오는 중 오류가 발생했습니다.',
  }
}

// 마지막으로 서버가 받은 요청 URL(pathname+search)을 잡아둔다 — 「무엇을 언제 조회했나」 검증용.
let lastUrl = ''
let calls = 0

function okWith(rows: ErrorLogRow[]) {
  server.use(
    http.get('*/error-logs', ({ request }) => {
      const u = new URL(request.url)
      lastUrl = u.pathname + u.search
      calls += 1
      return HttpResponse.json(rows)
    }),
  )
}

/** 화면에 보이는 위치(pathname+search)를 노출해 URL 계약을 검증한다. */
function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderPage(initialEntry = '/admin/errors') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/admin/errors" element={<><ErrorLogPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function columnHeaders(): string[] {
  return screen.getAllByRole('columnheader').map((th) => th.textContent ?? '')
}

function loc(): string {
  return screen.getByTestId('loc').textContent ?? ''
}

// InlineError가 useEffect에서 scrollIntoView를 부른다 — jsdom엔 레이아웃이 없어 스텁한다.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  lastUrl = ''
  calls = 0
})

describe('ErrorLogPage /admin/errors', () => {
  test('[ERRADM-HEAD-01] 제목과 설명이 화면의 목적을 넓히지 않는다', async () => {
    okWith([row()])
    renderPage()
    expect(screen.getByRole('heading', { name: '시스템 오류 기록' })).toBeVisible()
    expect(screen.getByText('오류가 발생한 시간과 기능을 확인합니다')).toBeVisible()
    // HEAD-01은 제목·설명(헤더)에 한정 — 헤더가 목적을 환자 데이터·발송 이력으로 넓히지 않는다.
    // (발송 이력 언급은 별도 규칙 ERRADM-NOTI-01의 이중기록 경계 노트가 갖는다 — 그건 정당하므로 헤더로 범위를 좁힌다.)
    const header = screen.getByText('오류가 발생한 시간과 기능을 확인합니다').closest('header')!
    expect(within(header).queryByText(/환자 데이터|발송 이력/)).toBeNull()
  })

  test('[ERRADM-NOTI-01] 이중기록 경계 안내가 있고 수신자별 발송 실패의 갈 길을 안내 보내기로 연결한다', async () => {
    okWith([row()])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/errors']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/admin/errors" element={<><ErrorLogPage /><LocationProbe /></>} />
            <Route path="/messages" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    // 발송 실패가 여기 없고 발송 이력에 있다는 경계 + 서비스 전체 장애만 기록됨을 밝힌다.
    expect(screen.getByText(/발송 이력에 남습니다/)).toBeVisible()
    expect(screen.getByText(/서비스 전체 장애/)).toBeVisible()
    // 막다른 길 방지 — 갈 길을 실제로 연다.
    await userEvent.click(screen.getByRole('button', { name: '안내 보내기' }))
    expect(loc()).toBe('/messages')
  })

  test('[ERRADM-HEAD-02][ERRADM-LIST-07] 읽기 전용 고지가 있고 행에 조작 버튼이 없으며 눌러도 안 펼쳐진다', async () => {
    okWith([row({ summary: '슬롯 충돌' })])
    renderPage()
    expect(screen.getByText('이 기록은 수정하거나 삭제할 수 없습니다')).toBeVisible()
    const r = await screen.findByTestId('error-row')
    expect(within(r).queryByRole('button', { name: /삭제|재실행|해결/ })).toBeNull()
    await userEvent.click(r)
    expect(within(r).queryByText(/스택|자세히|기술 상세/)).toBeNull()
  })

  test('[ERRADM-LIST-01][ERRADM-LIST-03] 열은 발생 시각·기능·오류 내용 3열이고 기능은 그대로 보인다', async () => {
    okWith([row({ feature: '통계 조회', summary: '집계 실패' })])
    renderPage()
    await screen.findByTestId('error-row')
    expect(columnHeaders()).toEqual(['발생 시각', '기능', '오류 내용'])
    expect(within(screen.getByTestId('error-row')).getByText('통계 조회')).toBeVisible()
  })

  test('[ERRADM-LIST-02] 발생 시각은 병원 시간대 절대값 YYYY.MM.DD HH:mm:ss다', async () => {
    okWith([row({ occurred_at: '2026-08-17T09:41:07+09:00' })])
    renderPage()
    expect(await screen.findByText('2026.08.17 09:41:07')).toBeVisible()
    expect(screen.queryByText(/분 전|시간 전/)).toBeNull()
  })

  test('[ERRADM-LIST-04] 오류 내용 칸은 안전 요약을 보이고 응답에 원문·비밀·전화가 없다', async () => {
    const payload = [row({ summary: '예약을 불러오는 중 오류가 발생했습니다.' })]
    okWith(payload)
    renderPage()
    expect(await screen.findByText('예약을 불러오는 중 오류가 발생했습니다.')).toBeVisible()
    expect(JSON.stringify(payload)).not.toMatch(/010-\d{4}-\d{4}|Bearer|password|message/)
  })

  test('[ERRADM-FILTER-01] 기본 조회는 필터 없이 최근 200건을 명시한다', async () => {
    okWith([row()])
    renderPage()
    await screen.findByTestId('error-row')
    expect(lastUrl).toBe('/error-logs')
    expect(screen.getByText(/최근 200건/)).toBeVisible()
  })

  test('[ERRADM-FILTER-04][ERRADM-FILTER-03] [조회]를 눌러야 재조회하고 URL엔 from/to만 담긴다', async () => {
    okWith([row()])
    renderPage()
    await screen.findByTestId('error-row')
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-08-17' } })
    expect(lastUrl).toBe('/error-logs')                                 // 입력만으론 조회 안 함
    await userEvent.click(screen.getByRole('button', { name: '조회' }))
    await waitFor(() => expect(lastUrl).toBe('/error-logs?from=2026-08-01&to=2026-08-17'))
    expect(loc()).toBe('/admin/errors?from=2026-08-01&to=2026-08-17')
  })

  test('[ERRADM-FILTER-03][NAV-SHELL-09] URL의 from/to로 진입하면 그 기간으로 조회하고 입력칸에 복원한다', async () => {
    okWith([row()])
    renderPage('/admin/errors?from=2026-08-01&to=2026-08-17')
    await waitFor(() => expect(lastUrl).toBe('/error-logs?from=2026-08-01&to=2026-08-17'))
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-08-01')
    expect(screen.getByLabelText('종료일')).toHaveValue('2026-08-17')
  })

  test('[ERRADM-FILTER-05] 시작일 > 종료일이면 서버에 안 보내고 종료일 아래 인라인 오류를 보인다', async () => {
    okWith([row()])
    renderPage()
    await screen.findByTestId('error-row')
    const callsBefore = calls
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-17' } })
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-08-01' } })
    await userEvent.click(screen.getByRole('button', { name: '조회' }))
    expect(screen.getByText('종료일은 시작일 이후로 선택해주세요')).toBeVisible()
    expect(calls).toBe(callsBefore)                                     // 서버 호출 안 함
    expect(loc()).toBe('/admin/errors')                                // URL도 안 바뀜
  })

  test('[ERRADM-STATE-01] 로딩 중엔 열 머리를 유지하고 skeleton 4줄을 보이며 이전 행을 안 섞는다', async () => {
    server.use(http.get('*/error-logs', async () => {
      await delay(80)
      return HttpResponse.json([row({ feature: '새 결과' })])
    }))
    renderPage()
    expect(columnHeaders()).toEqual(['발생 시각', '기능', '오류 내용'])
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(4)
    expect(screen.getByText('오류 기록을 불러오는 중입니다')).toBeVisible()
    expect(screen.queryByText('새 결과')).toBeNull()
    await screen.findByText('새 결과')
  })

  test('[ERRADM-STATE-04] 결과 0건은 안내를 보이고 조회 실패용 [다시 시도]를 붙이지 않는다', async () => {
    okWith([])
    renderPage()
    expect(await screen.findByText('해당 기간에 오류 기록이 없습니다')).toBeVisible()
    expect(screen.getByText('기간을 넓혀 다시 조회해보세요')).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  test('[ERRADM-STATE-02] 조회 실패는 같은 화면 오류 + [다시 시도], 기간 필터를 보존한다', async () => {
    server.use(http.get('*/error-logs', () => new HttpResponse(null, { status: 500 })))
    renderPage('/admin/errors?from=2026-08-01&to=2026-08-17')
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-08-01')   // 필터 보존
    expect(screen.queryByRole('table')).toBeNull()
  })

  test('[ERRADM-STATE-03] 오프라인은 캐시를 안 보이고 배너 + [다시 시도]를 준다', async () => {
    server.use(http.get('*/error-logs', () => HttpResponse.error()))
    renderPage()
    expect(await screen.findByText('인터넷이 연결되어 있지 않습니다')).toBeVisible()
    expect(screen.getByText('연결되면 오류 기록을 볼 수 있습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
