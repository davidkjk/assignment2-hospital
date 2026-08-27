import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { TodayPage } from './TodayPage'
import type { TodaySummary } from '../api/dashboard'

// 백엔드 계약: backend/app/services/dashboard_service.py::get_today_summary
// 응답은 patient_row_dto 화이트리스트(masked_*)만 싣는다 — 원문 이름·번호는 여기 없다.
const FULL: TodaySummary = {
  tiles: { total_reserved: 24, arrived: 3, waiting: 5, in_progress: 2, completed: 12, cancelled_or_noshow: 2 },
  long_wait: [
    { patient_id: 'p1', masked_name: '김*동', masked_birth_date: '1990-**-**', appointment_id: 'a1', wait_minutes: 42 },
    { patient_id: 'p2', masked_name: '이*', masked_birth_date: '1985-**-**', appointment_id: 'a2', wait_minutes: 31 },
  ],
  needs_attention: [
    { patient_id: 'p3', masked_name: '박*수', masked_birth_date: '1978-**-**', appointment_id: 'a3', reason: '취소 상담 · 직원 확인 중' },
  ],
  badge_excluded_patient_ids: ['p3'],
  bot_pending: null,
}

const EMPTY: TodaySummary = {
  tiles: { total_reserved: 0, arrived: 0, waiting: 0, in_progress: 0, completed: 0, cancelled_or_noshow: 0 },
  long_wait: [],
  needs_attention: [],
  badge_excluded_patient_ids: [],
  bot_pending: 4,
}

function summaryOk(body: TodaySummary) {
  server.use(http.get('*/today/summary', () => HttpResponse.json(body)))
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderToday() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/today']}>
        <Routes>
          <Route path="/today" element={<TodayPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => sessionStorage.clear())

describe('오늘의 현황 /today', () => {
  test('[TODAY-LAY-01] 「지금 처리할 것」이 「오늘 요약」 타일보다 먼저 나온다', async () => {
    summaryOk(FULL)
    renderToday()
    const processing = await screen.findByRole('heading', { name: '지금 처리할 것' })
    const summary = screen.getByRole('heading', { name: '오늘 요약' })
    // DOCUMENT_POSITION_FOLLOWING(4) = summary가 processing 뒤에 온다.
    expect(processing.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('[TODAY-LAY-03] 처리할 것 ≥1건이면 제목 옆에 총계를 주의색으로 보인다', async () => {
    summaryOk(FULL) // long_wait 2 + needs_attention 1 = 3
    renderToday()
    const total = await screen.findByTestId('processing-total')
    expect(total).toHaveTextContent('3')
    expect(total).toHaveStyle({ color: 'var(--color-warn)' })
  })

  test('[TODAY-WAIT-01] 장기 대기 행에 「N분 대기」 사유를 보인다', async () => {
    summaryOk(FULL)
    renderToday()
    expect(await screen.findByText('장기 대기')).toBeVisible()
    expect(screen.getByText('42분 대기')).toBeVisible()
  })

  test('[TODAY-BTN-01] 장기 대기 행은 [진료 시작] 없이 [대기 목록에서 보기]·[환자 상세]만 둔다', async () => {
    summaryOk(FULL)
    renderToday()
    const row = await screen.findByTestId('longwait-row-a1')
    expect(within(row).getByRole('button', { name: '대기 목록에서 보기' })).toBeVisible()
    expect(within(row).getByRole('button', { name: '환자 상세' })).toBeVisible()
    expect(within(row).queryByRole('button', { name: '진료 시작' })).toBeNull()
  })

  test('[TODAY-RESCHED-23] 취소·변경 상담을 「확인 필요한 예약」 카드의 행으로 합치고 별도 수치 카드를 안 만든다', async () => {
    summaryOk(FULL)
    renderToday()
    expect(await screen.findByText('확인 필요한 예약')).toBeVisible()
    expect(screen.getByText('취소 상담 · 직원 확인 중')).toBeVisible()
    // ⛔ 독립 「취소 요청 N」·「변경 요청 N」 수치 카드를 만들지 않는다.
    expect(screen.queryByText(/취소 요청\s*\d/)).toBeNull()
    expect(screen.queryByText(/변경 요청\s*\d/)).toBeNull()
  })

  test('[TODAY-RESCHED-24] 지원 요청 행은 [예약·상담 보기] 하나만 둔다(옮기기·취소 도장 없음)', async () => {
    summaryOk(FULL)
    renderToday()
    const row = await screen.findByTestId('needs-row-a3')
    expect(within(row).getByRole('button', { name: '예약·상담 보기' })).toBeVisible()
    expect(within(row).queryByRole('button', { name: '예약 옮기기' })).toBeNull()
    expect(within(row).queryByRole('button', { name: '취소' })).toBeNull()
    expect(within(row).queryByRole('button', { name: '그대로 두기' })).toBeNull()
  })

  test('[TODAY-RESCHED-25] [예약·상담 보기]는 해당 예약이 선택된 캘린더로 이동한다', async () => {
    summaryOk(FULL)
    const user = userEvent.setup()
    renderToday()
    const row = await screen.findByTestId('needs-row-a3')
    await user.click(within(row).getByRole('button', { name: '예약·상담 보기' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/calendar?appointment=a3')
  })

  test('[TODAY-SUM-01] 오늘 요약 타일 6개를 보인다', async () => {
    summaryOk(FULL)
    renderToday()
    await screen.findByText('오늘 요약')
    for (const label of ['전체 예약', '도착', '진료 대기', '진료 중', '진료 완료', '취소·부도']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeVisible()
    }
  })

  test('[TODAY-SUM-03] 타일을 누르면 그 상태 탭이 눌린 /queue로 간다', async () => {
    summaryOk(FULL)
    const user = userEvent.setup()
    renderToday()
    await user.click(await screen.findByRole('button', { name: /진료 대기/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/queue?tab=waiting')
  })

  test('[TODAY-SUM-05] 「진료 완료」 타일도 다른 타일과 똑같이 눌린다', async () => {
    summaryOk(FULL)
    const user = userEvent.setup()
    renderToday()
    const completed = await screen.findByRole('button', { name: /진료 완료/ })
    expect(completed).toBeEnabled()
    await user.click(completed)
    expect(screen.getByTestId('location')).toHaveTextContent('/queue?tab=completed')
  })

  test('[TODAY-EMPTY-01] 처리할 것 0건이면 사실 문장과 안내 문장을 함께 보인다', async () => {
    summaryOk(EMPTY)
    renderToday()
    expect(await screen.findByText('지금 처리할 일이 없습니다')).toBeVisible()
    expect(screen.getByText('새 문제가 생기면 여기에 바로 나타납니다')).toBeVisible()
    // 0건이어도 타일은 그대로 보인다(위로 올라온다).
    expect(screen.getByRole('button', { name: /전체 예약/ })).toBeVisible()
  })

  test('[TODAY-EMPTY-02] 0건 화면에 [다시 시도] 버튼을 두지 않는다', async () => {
    summaryOk(EMPTY)
    renderToday()
    await screen.findByText('지금 처리할 일이 없습니다')
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  test('[TODAY-CARD-01] 카드 제목은 좌측 주의색 바를 두고 배경을 칠하지 않는다', async () => {
    summaryOk(FULL)
    renderToday()
    const header = await screen.findByTestId('card-header-longwait')
    // jsdom은 var()가 든 border 단축속성을 개별 속성으로 분해하지 않아 단축속성 문자열로 확인한다.
    expect(header.style.borderLeft).toContain('var(--color-warn)')
    expect(header.style.background).toBe('') // 전면 배경을 칠하지 않는다
  })

  test('[TODAY-DATE-01] 화면에 오늘 날짜를 보인다', async () => {
    summaryOk(FULL)
    renderToday()
    const date = await screen.findByTestId('today-date')
    expect(date).toHaveTextContent(String(new Date().getFullYear()))
  })

  test('[STAT-METRIC-06] 상담 문의 집계가 없으면(null) 「현재 집계할 수 없음」을 보인다', async () => {
    summaryOk(FULL) // bot_pending: null
    renderToday()
    expect(await screen.findByText('현재 집계할 수 없음')).toBeVisible()
  })

  test('[STAT-METRIC-06] 상담 문의 집계가 있으면 그 수를 보인다', async () => {
    summaryOk(EMPTY) // bot_pending: 4
    renderToday()
    const pending = await screen.findByTestId('bot-pending')
    expect(pending).toHaveTextContent('4')
  })

  test('[ERR-RETRY-02] 조회 실패는 「다시 시도」가 있는 오류 화면으로 보인다', async () => {
    server.use(http.get('*/today/summary', () => HttpResponse.json({ detail: '오류' }, { status: 500 })))
    renderToday()
    expect(await screen.findByText('정보를 불러오지 못했습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible()
  })
})
