import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { Today } from './today/Today'
import type { TodaySummary } from '../api/dashboard'

// 백엔드 계약: backend/app/services/dashboard_service.py::get_today_summary
// 응답은 patient_row_dto 화이트리스트(masked_*)만 싣는다 — 원문 이름·번호는 여기 없다.
const FULL: TodaySummary = {
  tiles: { total_reserved: 24, arrived: 3, waiting: 5, in_progress: 2, completed: 12, cancelled_or_noshow: 2 },
  long_wait: [
    { patient_id: 'p1', name: '김*동', masked_birth_date: '1990-**-**', appointment_id: 'a1', wait_minutes: 42 },
    { patient_id: 'p2', name: '이*', masked_birth_date: '1985-**-**', appointment_id: 'a2', wait_minutes: 31 },
  ],
  needs_attention: [
    { patient_id: 'p3', name: '박*수', masked_birth_date: '1978-**-**', appointment_id: 'a3', reason: '취소 상담 · 직원 확인 중' },
  ],
  not_arrived: [],
  yesterday_unfinished: [],
  doctor_waiting: [],
  badge_excluded_patient_ids: ['p3'],
  bot_pending: null,
}

const EMPTY: TodaySummary = {
  tiles: { total_reserved: 0, arrived: 0, waiting: 0, in_progress: 0, completed: 0, cancelled_or_noshow: 0 },
  long_wait: [],
  needs_attention: [],
  not_arrived: [],
  yesterday_unfinished: [],
  doctor_waiting: [],
  badge_excluded_patient_ids: [],
  bot_pending: 4,
}

// 네 카드가 모두 있는 화면(TODAY-NOSHOW/YDAY/ORDER 검증용).
const ALL: TodaySummary = {
  ...FULL,
  not_arrived: [
    { patient_id: 'p9', name: '최*연', masked_birth_date: '1970-**-**', appointment_id: 'a9', slot_time: '09:30:00' },
  ],
  yesterday_unfinished: [
    { patient_id: 'p8', name: '정*훈', masked_birth_date: '1982-**-**', appointment_id: 'a8', slot_date: '2026-08-02', slot_time: '16:30:00', reason: '진료 중인 채로 마감' },
  ],
  doctor_waiting: [
    { doctor_id: 'd1', doctor_name: '박지훈', department_name: '내과', waiting_count: 3 },
  ],
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
          <Route path="/today" element={<Today />} />
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
    const processing = await screen.findByRole('heading', { name: /지금 처리할 것/ })
    const summary = screen.getByRole('heading', { name: '오늘 요약' })
    // DOCUMENT_POSITION_FOLLOWING(4) = summary가 processing 뒤에 온다.
    expect(processing.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('[TODAY-LAY-03] 처리할 것 ≥1건이면 제목 옆에 총계를 주의색으로 보인다', async () => {
    summaryOk(FULL) // long_wait 2 + needs_attention 1 = 3
    renderToday()
    const total = await screen.findByTestId('processing-total')
    expect(total).toHaveTextContent('3')
    // 데모 마크업은 주의색을 Tailwind 별칭(amber)으로 낸다 — jsdom은 className→computed color를 못 하므로 클래스로 확인.
    expect(total.className).toMatch(/amber/)
  })

  test('[TODAY-WAIT-01] 장기 대기 행에 「N분 대기」 사유를 보인다', async () => {
    summaryOk(FULL)
    renderToday()
    expect(await screen.findByRole('heading', { name: '장기 대기' })).toBeVisible()
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
    expect(await screen.findByRole('heading', { name: '확인 필요한 예약' })).toBeVisible()
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

  test('[TODAY-NOSHOW-01] 미접수·시각 경과 카드에 예약 시각 레일과 함께 행을 보인다', async () => {
    summaryOk(ALL)
    renderToday()
    expect(await screen.findByRole('heading', { name: '미접수 · 시각 경과' })).toBeVisible()
    const row = screen.getByTestId('noshow-row-a9')
    expect(within(row).getByText('09:30')).toBeVisible() // 예약 시각 레일
    // TODAY-NOSHOW-03: 「안 오셨습니다」 계열 책망 문구를 쓰지 않는다.
    expect(screen.queryByText(/안 오셨/)).toBeNull()
  })

  test('[TODAY-BTN-02] 미접수 행은 [진료 대기]·[도착] 두 갈래 버튼을 둔다', async () => {
    summaryOk(ALL)
    renderToday()
    const row = await screen.findByTestId('noshow-row-a9')
    expect(within(row).getByRole('button', { name: '진료 대기' })).toBeVisible()
    expect(within(row).getByRole('button', { name: '도착' })).toBeVisible()
  })

  test('[TODAY-YDAY-01/03] 전일 미완료가 전부 같은 날이면 날짜를 카드 머리에 한 번만 보이고, 행엔 반복하지 않는다', async () => {
    summaryOk(ALL)
    renderToday()
    expect(await screen.findByRole('heading', { name: '전일 미완료' })).toBeVisible()
    // TODAY-YDAY-03(개정 2026-08-30): 같은 날이면 날짜(8/2)는 카드 머리에 한 번만.
    const header = screen.getByTestId('card-header-yday')
    expect(within(header).getByText(/8\/2/)).toBeVisible()
    const row = screen.getByTestId('yday-row-a8')
    expect(within(row).getByText('진료 중인 채로 마감')).toBeVisible()
    expect(within(row).queryByText(/8\/2/)).toBeNull() // 행엔 날짜를 달지 않는다
  })

  test('[TODAY-YDAY-03] 여러 지난 날이 섞이면 그때만 행에 날짜를 달아 구분한다', async () => {
    summaryOk({
      ...ALL,
      yesterday_unfinished: [
        { patient_id: 'p8', name: '정*훈', masked_birth_date: '1982-**-**', appointment_id: 'a8', slot_date: '2026-08-02', slot_time: '16:30:00', reason: '진료 중인 채로 마감' },
        { patient_id: 'p7', name: '김*수', masked_birth_date: '1990-**-**', appointment_id: 'a7', slot_date: '2026-07-30', slot_time: '10:00:00', reason: '진료 중인 채로 마감' },
      ],
    })
    renderToday()
    expect(await screen.findByRole('heading', { name: '전일 미완료' })).toBeVisible()
    // 여러 날이므로 머리엔 단일 날짜를 두지 않고, 행마다 날짜로 구분한다.
    expect(within(screen.getByTestId('yday-row-a8')).getByText(/8\/2/)).toBeVisible()
    expect(within(screen.getByTestId('yday-row-a7')).getByText(/7\/30/)).toBeVisible()
  })

  test('[TODAY-ORDER-01] 카드 순서는 장기대기 → 미접수 → 전일미완료 → 확인필요', async () => {
    summaryOk(ALL)
    renderToday()
    await screen.findByTestId('card-header-longwait')
    const order = ['card-header-longwait', 'card-header-noshow', 'card-header-yday', 'card-header-needs']
      .map((id) => screen.getByTestId(id))
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  test('[TODAY-DOC-01] 오늘 요약에 진료과+의사 이름과 대기 수를 보인다(진료과 생략 안 함)', async () => {
    summaryOk(ALL)
    renderToday()
    const row = await screen.findByTestId('doc-waiting-d1')
    expect(within(row).getByText(/내과/)).toBeVisible()
    expect(within(row).getByText(/박지훈/)).toBeVisible()
    expect(within(row).getByText(/3/)).toBeVisible()
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
    // 좌측 주의색 바(데모는 별도 span.bg-amber-500) + 배경 안 칠함.
    expect(header.querySelector('.bg-amber-500')).toBeTruthy()
    expect(header.style.background).toBe('') // 전면 배경을 칠하지 않는다
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
