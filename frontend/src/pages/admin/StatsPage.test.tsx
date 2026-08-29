import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../../test/msw/server'
import { StatsPage } from './StatsPage'
import type { StatsByResponse, StatsResponse } from '../../api/stats'

// 백엔드 계약: backend/app/services/stats_service.py — 응답은 마스킹·집계만, 원본 PII 없음.
const STATS: StatsResponse = {
  source_mix: { basis: 'created_at', rows: { app: 70, staff: 44, chatbot: 6 }, total: 120 },
  cancelled: { basis: 'status_changed_at', value: 8 },
  no_show: { basis: 'status_changed_at', value: 3 },
  visits: { basis: 'status_changed_at', value: 95 },
  wait: { basis: 'wait_started_at', avg_minutes: 18, over_threshold: 30, threshold_minutes: 30 },
  visits_by_hour: { basis: 'slot_start_time', by_hour: { '9': 20, '10': 30 }, unknown_time: 3 },
  bot: { total_inquiries: 312, self_served: 248, handoff: 64, top_questions: null },
}
const BY: StatsByResponse = {
  by: 'department',
  rows: [
    { label: '피부과', booked: 1, visited: 1, no_show: 1 },
    { label: '내과', booked: 80, visited: 70, no_show: 5 },
  ],
}

function statsOk(overrides?: Partial<StatsResponse>) {
  server.use(
    http.get('*/stats', ({ request }) => {
      const by = new URL(request.url).searchParams.get('by')
      if (by) return HttpResponse.json({ ...BY, by })
      return HttpResponse.json({ ...STATS, ...overrides })
    }),
  )
}

function renderStats(initialPeriod = { from: '2026-08-01', to: '2026-08-15' }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<StatsPage initialPeriod={initialPeriod} />} />
          <Route path="/today" element={<div>오늘의 현황 화면</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const metricCard = (label: string) => screen.getByRole('group', { name: label })
const metricValue = (key: string) => screen.getByTestId(`metric-value-${key}`).textContent

beforeEach(() => sessionStorage.clear())

describe('운영 통계 /admin/stats', () => {
  test('[STAT-SHELL-03] 제목·설명만 두고 목적을 넓히지 않는다', async () => {
    statsOk()
    renderStats()
    // 제목은 셸 헤더가 그린다(STAFF-SHELL-02 개정) — 본문엔 두지 않고 설명만 남는다.
    expect(screen.queryByRole('heading', { name: '운영 통계' })).toBeNull()
    expect(screen.getByText('선택한 기간의 병원 운영 흐름을 집계합니다')).toBeVisible()
    expect(screen.queryByText(/시스템 오류|직원 활동/)).toBeNull()
  })

  test('[STAT-METRIC-01] 지표 라벨과 예약 값(120)·기준일을 함께 보인다', async () => {
    statsOk()
    renderStats()
    expect(await screen.findByRole('group', { name: '예약' })).toBeVisible()
    for (const label of ['예약', '취소', '예약 부도', '실제 방문', '평균 대기시간', '오래 기다린 사례']) {
      expect(metricCard(label)).toBeVisible()
    }
    expect(metricValue('booked')).toBe('120')
    expect(within(metricCard('예약')).getByText(/2026-08-01 ~ 2026-08-15/)).toBeVisible()
  })

  test('[STAT-SCOPE-03][결정5] 지표마다 기준일이 무엇인지 옆에 적는다', async () => {
    statsOk()
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    expect(within(metricCard('예약')).getByText(/생성일 기준/)).toBeVisible()
    expect(within(metricCard('실제 방문')).getByText(/상태 전이일 기준/)).toBeVisible()
    expect(within(metricCard('평균 대기시간')).getByText(/대기 시작일 기준/)).toBeVisible()
  })

  test('[STAT-METRIC-01] 목록형만 [상세 목록]을 두고 평균 대기엔 두지 않는다', async () => {
    statsOk()
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    expect(within(metricCard('예약')).getByRole('button', { name: '상세 목록' })).toBeVisible()
    expect(within(metricCard('평균 대기시간')).queryByRole('button', { name: '상세 목록' })).toBeNull()
  })

  test('[STAT-METRIC-04] 평균 대기와 기준 초과 건수는 보이되 상세 목록은 아직 열지 않는다', async () => {
    statsOk()
    renderStats()
    await screen.findByRole('group', { name: '평균 대기시간' })
    expect(metricValue('avg_wait')).toBe('18분')
    expect(metricValue('long_wait')).toBe('30건') // 기준 초과 사례 수
    expect(within(metricCard('오래 기다린 사례')).queryByRole('button', { name: '상세 목록' })).toBeNull()
  })

  test('[STAT-METRIC-03] 시간 없는 당일 방문을 「시간 미기록」으로 분리한다', async () => {
    statsOk()
    renderStats()
    expect(await screen.findByText('시간 미기록')).toBeVisible()
  })

  test('[STAT-METRIC-06] 상담봇 계약이 없으면 0으로 위장하지 않고 「현재 집계할 수 없음」', async () => {
    statsOk({ bot: null })
    renderStats()
    expect(await screen.findByText('상담봇 지표')).toBeVisible()
    expect(within(screen.getByRole('region', { name: '상담봇 지표' })).getAllByText('현재 집계할 수 없음').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('region', { name: '상담봇 지표' })).queryByText('0건')).toBeNull()
  })

  test('[STAT-MASK-01][STAT-DRILL-01] 화면은 1건짜리 칸도 그대로 보이고 누를 수 있다', async () => {
    statsOk()
    renderStats()
    const cell = await screen.findByRole('button', { name: '피부과 예약 부도 상세 목록' })
    expect(cell).toBeEnabled()
    expect(cell).toHaveTextContent('1') // 화면은 소수 억제를 하지 않는다(결정21)
  })

  test('[STAT-SCOPE-01] 날짜가 하나라도 비면 조회하지 않는다', async () => {
    statsOk()
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: '통계 보기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('시작일과 종료일을 모두 선택')
  })

  test('[STAT-SCOPE-02] 시작일이 종료일보다 뒤면 보내지 않고 입력을 지우지 않는다', async () => {
    statsOk()
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-30' } })
    await userEvent.click(screen.getByRole('button', { name: '통계 보기' }))
    expect(screen.getByText(/종료일은 시작일 이후/)).toBeVisible()
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-08-30')
  })

  test('[STAT-STATE-01] 조회 중엔 이전 기간 값을 새 응답처럼 보이지 않는다', async () => {
    statsOk()
    renderStats()
    await waitFor(() => expect(metricValue('booked')).toBe('120'))
    // 새 기간은 응답을 지연시켜 조회 중 상태를 관찰한다.
    server.use(
      http.get('*/stats', async ({ request }) => {
        const by = new URL(request.url).searchParams.get('by')
        await delay(60)
        if (by) return HttpResponse.json({ ...BY, by })
        return HttpResponse.json({ ...STATS, source_mix: { ...STATS.source_mix, total: 77 } })
      }),
    )
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-07-31' } })
    await userEvent.click(screen.getByRole('button', { name: '통계 보기' }))
    await waitFor(() => expect(metricCard('예약')).toHaveAttribute('aria-busy', 'true'))
    expect(metricValue('booked')).not.toBe('120')
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-07-01')
    await waitFor(() => expect(metricValue('booked')).toBe('77'))
  })

  test('[STAT-STATE-02] 0건은 실패가 아니라 사실이라 [다시 시도]를 두지 않는다', async () => {
    statsOk({
      source_mix: { basis: 'created_at', rows: { app: 0, staff: 0, chatbot: 0 }, total: 0 },
      cancelled: { basis: 'status_changed_at', value: 0 },
      no_show: { basis: 'status_changed_at', value: 0 },
      visits: { basis: 'status_changed_at', value: 0 },
    })
    renderStats()
    expect(await screen.findByText('선택한 기간에 집계할 사건이 없습니다')).toBeVisible()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    expect(screen.getByRole('button', { name: '통계 보기' })).toBeEnabled() // 기간 변경 경로는 남는다
  })

  test('[STAT-STATE-03] 조회 실패엔 공통 오류·재시도·이동 경로를 그대로 쓴다', async () => {
    server.use(http.get('*/stats', () => new HttpResponse(null, { status: 500 })))
    renderStats()
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeVisible()
    expect(screen.getByRole('link', { name: '오늘의 현황으로 가기' })).toBeVisible()
  })

  test('[STAT-AUDIT-01][결정22] 기간·필터 변경만으로는 감사·드릴다운을 부르지 않는다', async () => {
    statsOk()
    let audits = 0
    let details = 0
    server.use(
      http.post('*/audit/stats', () => {
        audits += 1
        return HttpResponse.json({ ok: true })
      }),
      http.get('*/stats/detail', () => {
        details += 1
        return HttpResponse.json({ rows: [], next_cursor: null, has_more: false })
      }),
    )
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-07-01' } })
    await userEvent.click(screen.getByRole('button', { name: '통계 보기' }))
    await waitFor(() => expect(metricValue('booked')).toBe('120'))
    expect(audits).toBe(0)
    expect(details).toBe(0)
  })

  test('[STAT-DRILL-03] 진료과×예약 셀을 누르면 metric·dept·dim을 서버로 실어 그 그룹으로 좁힌다', async () => {
    // 셀 드릴다운이 dept/dim을 서버까지 보내지 않아 전체 명단을 보이던 버그의 회귀 가드.
    statsOk()
    let detailUrl: URL | undefined
    server.use(
      http.get('*/stats/detail', ({ request }) => {
        detailUrl = new URL(request.url)
        return HttpResponse.json({ rows: [], next_cursor: null, has_more: false })
      }),
    )
    renderStats()
    const cell = await screen.findByRole('button', { name: '내과 예약 상세 목록' })
    await userEvent.click(cell)
    await waitFor(() => expect(detailUrl).toBeDefined())
    expect(detailUrl!.searchParams.get('metric')).toBe('booked')
    expect(detailUrl!.searchParams.get('dept')).toBe('내과')
    expect(detailUrl!.searchParams.get('dim')).toBe('department')
  })

  test('[STAT-DRILL-01] 상단 예약 카드 드릴다운은 전체 병원이라 dept·dim을 싣지 않는다', async () => {
    statsOk()
    let detailUrl: URL | undefined
    server.use(
      http.get('*/stats/detail', ({ request }) => {
        detailUrl = new URL(request.url)
        return HttpResponse.json({ rows: [], next_cursor: null, has_more: false })
      }),
    )
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    await userEvent.click(within(metricCard('예약')).getByRole('button', { name: '상세 목록' }))
    await waitFor(() => expect(detailUrl).toBeDefined())
    expect(detailUrl!.searchParams.get('metric')).toBe('booked')
    expect(detailUrl!.searchParams.get('dept')).toBeNull()
    expect(detailUrl!.searchParams.get('dim')).toBeNull()
  })

  test('[STAT-EXPORT-02][STAT-AUDIT-02] CSV 내보내기만 감사하고, payload에 환자 원본을 안 싣는다', async () => {
    statsOk()
    let body: unknown
    server.use(
      http.post('*/audit/stats', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    renderStats()
    await screen.findByRole('group', { name: '예약' })
    await userEvent.click(screen.getByRole('button', { name: 'CSV 다운로드' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/파일에서는 5명 미만 칸이 가려집니다/)
    await userEvent.click(screen.getByRole('button', { name: '내려받기' }))
    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({ metric: 'department', row_count: 2, suppressed: true })
    expect(JSON.stringify(body)).not.toMatch(/홍|010-|피부과/)
  })
})
