import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { server } from '../../test/msw/server'
import { CalendarPage } from './CalendarPage'
import { PanelHost, PanelProvider } from '../../components/PanelHost'
import type { CalendarData } from '../../api/calendar'

// 셸 채널 구독만 하는 useCalendarRealtime가 실제 supabase를 부르지 않게 막는다(SHELL-LIVE-02).
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel: () => {},
  },
}))

const NOW = new Date('2026-08-06T09:00:00+09:00') // 목요일

const DATA: CalendarData = {
  booking_horizon_date: '2026-10-01',
  doctors: [
    { id: 'd1', name: '박지훈', department_name: '내과', palette_index: null, slot_minutes: null },
    { id: 'd2', name: '최민석', department_name: '내과', palette_index: null, slot_minutes: null },
    { id: 'd3', name: '한소연', department_name: '피부과', palette_index: null, slot_minutes: null },
  ],
  appointments: [
    { patient_id: 'p1', name: '김*지', appointment_id: 'a1', doctor_id: 'd1', status: 'confirmed', start: '2026-08-06T10:00:00+09:00', end: '2026-08-06T10:15:00+09:00' },
  ],
  blocks: [],
  affected_appointment_ids: [],
}

function calendarOk(body: CalendarData = DATA) {
  server.use(
    // 칩·색 팔레트는 필터와 무관한 전체 카탈로그에서 온다(L11) — 격자 응답의 doctors와 같은 목록으로 준다.
    http.get('*/calendar/doctors', () => HttpResponse.json(body.doctors)),
    http.get('*/calendar', () => HttpResponse.json(body)),
  )
}

// 예약 상세 패널은 이제 뷰와 무관하게 GET /appointments/:id로 한 건을 읽는다(딥링크가 미래 날짜
// 상담 예약을 열어도 채워지도록). 패널을 여는 테스트는 이 응답을 함께 준다.
function appointmentOk(over: Record<string, unknown> = {}) {
  server.use(
    http.get('*/appointments/:id', () =>
      HttpResponse.json({
        appointment_id: 'a1', status: 'confirmed', doctor_name: '박지훈', department_name: '내과',
        start: '2026-08-06T10:00:00', patient: { patient_id: 'p1', name: '김*지' }, support: null, ...over,
      }),
    ),
  )
}

function renderPage(entry = '/calendar') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[entry]}>
        <PanelProvider>
          <CalendarPage now={NOW} />
          <PanelHost />
        </PanelProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

test('[CAL-VIEW-03] 기본은 일간+전체 — 의사가 열이 되고 이름이 순서대로 선다', async () => {
  calendarOk()
  renderPage()
  expect(await screen.findByTestId('head-d1')).toHaveTextContent('박지훈')
  expect(screen.getByTestId('head-d2')).toHaveTextContent('최민석')
  expect(screen.getByTestId('head-d3')).toHaveTextContent('한소연')
})

test('[CAL-DOC-04][CAL-DOC-05] 진료과 칩이 의사 칩을 좁히고 걸린 필터가 글자로 남는다', async () => {
  calendarOk()
  const user = userEvent.setup()
  renderPage()
  await screen.findByTestId('head-d1')
  const deptGroup = screen.getByRole('group', { name: '진료과' })
  await user.click(within(deptGroup).getByRole('button', { name: '내과' }))
  const nameGroup = screen.getByRole('group', { name: '의사' })
  const chips = within(nameGroup).getAllByRole('button').map((b) => b.textContent)
  expect(chips).toEqual(['전체', '박지훈', '최민석']) // 피부과 한소연은 빠진다
  expect(screen.getByText('내과만 보는 중')).toBeVisible()
})

test('[L11] 의사 한 명을 골라도 나머지 의사 칩이 남아 다른 의사를 더 고를 수 있다', async () => {
  // 격자(/calendar)는 필터를 존중해 고른 의사만 반환한다(실제 백엔드 동작). 그래도 칩(/calendar/doctors)은
  // 늘 전체라, 한 명 고른 뒤에도 나머지 칩이 남아야 한다 — 예전엔 칩을 필터된 격자에서 만들어 순환에 빠졌다.
  server.use(
    http.get('*/calendar/doctors', () => HttpResponse.json(DATA.doctors)),
    http.get('*/calendar', ({ request }) => {
      const ids = new URL(request.url).searchParams.get('doctor_ids')
      if (!ids) return HttpResponse.json(DATA)
      const picked = ids.split(',')
      return HttpResponse.json({
        ...DATA,
        doctors: DATA.doctors.filter((d) => picked.includes(d.id)),
        appointments: DATA.appointments.filter((a) => picked.includes(a.doctor_id)),
      })
    }),
  )
  const user = userEvent.setup()
  renderPage()
  await screen.findByTestId('head-d1')
  const nameGroup = screen.getByRole('group', { name: '의사' })
  await user.click(within(nameGroup).getByRole('button', { name: '박지훈' }))
  // 격자는 좁혀져 한소연 열이 사라지지만…
  await waitFor(() => expect(screen.queryByTestId('head-d3')).toBeNull())
  // …칩은 전부 남아 다른 의사를 더 고를 수 있다.
  const chips = within(screen.getByRole('group', { name: '의사' })).getAllByRole('button').map((b) => b.textContent)
  expect(chips).toEqual(['전체', '박지훈', '최민석', '한소연'])
})

test('[CAL-VIEW-07][CAL-VIEW-08] 주간으로 바꿔도 의사를 자동으로 좁히지 않고 「외 N」으로 접지 않는다', async () => {
  calendarOk()
  const user = userEvent.setup()
  renderPage()
  await screen.findByTestId('head-d1')
  await user.click(screen.getByRole('button', { name: '주간' }))
  expect(await screen.findByTestId('week-grid')).toBeVisible()
  expect(screen.queryByText(/외 \d+/)).toBeNull()
})

test('[CAL-NAV-04][CAL-NAV-05] 기간 글자 자체가 버튼이고 별도 [달력 열기] 아이콘을 두지 않는다', async () => {
  calendarOk()
  renderPage()
  await screen.findByTestId('head-d1')
  expect(screen.getByRole('button', { name: /2026년 8월 6일/ })).toBeVisible()
  expect(screen.queryByLabelText('달력 열기')).toBeNull()
})

test('[CAL-NAV-03][CAL-NAV-08] 화살표는 단위만큼 움직이고 [오늘]로 돌아온다', async () => {
  calendarOk()
  const user = userEvent.setup()
  renderPage()
  await screen.findByTestId('head-d1')
  await user.click(screen.getByRole('button', { name: '다음' }))
  expect(screen.getByRole('button', { name: /8월 7일/ })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '오늘' }))
  expect(screen.getByRole('button', { name: /8월 6일/ })).toBeVisible()
})

test('[CAL-NAV-06][CAL-NAV-07] 작은 달력이 잡는 단위를 글자로 적고 보기마다 다르다', async () => {
  calendarOk()
  const user = userEvent.setup()
  renderPage()
  await screen.findByTestId('head-d1')
  await user.click(screen.getByRole('button', { name: '주간' }))
  await user.click(screen.getByRole('button', { name: /2026년 8월/ }))
  expect(screen.getByTestId('mini-unit-note')).toHaveTextContent('누른 날이 든 주로 이동합니다')
})

test('[NAV-QUEUE-07][NAV-TODAY-06][CAL-PANEL-06] 밖에서 들어오면 예약 패널이 이미 열린 채로 뜬다', async () => {
  calendarOk()
  appointmentOk()
  renderPage('/calendar?appointment=a1&panel=open')
  const panel = await screen.findByRole('complementary', { name: '패널' })
  expect(await within(panel).findByRole('button', { name: '예약 변경' })).toBeVisible()
})

test('[CAL-SLOT-07] 예약 블록을 누르면 오른쪽에 예약 상세 패널이 열린다', async () => {
  calendarOk()
  appointmentOk()
  const user = userEvent.setup()
  renderPage()
  await screen.findByTestId('head-d1')
  await user.click(screen.getByText('김*지'))
  const panel = await screen.findByRole('complementary', { name: '패널' })
  expect(await within(panel).findByRole('button', { name: '예약 변경' })).toBeVisible()
})

test('[CAL-PANEL-*] 딥링크한 예약이 오늘 격자에 없어도(미래 날짜 상담) 패널이 채워진다', async () => {
  // 회귀 가드: 예전엔 오늘 격자 막대에서 값을 찾다 못 찾으면 「환자 · 」로 텅 비었다.
  calendarOk() // 격자엔 a1만. 딥링크는 격자에 없는 future1.
  appointmentOk({
    appointment_id: 'future1', status: '예약확정', doctor_name: '이정민', department_name: '내과',
    start: '2026-09-03T17:00:00', patient: { patient_id: 'p9', name: '오*은' },
    support: { request_type: '변경', requested_at: '2026-08-29T03:18:00Z' },
  })
  renderPage('/calendar?appointment=future1&panel=open')
  const panel = await screen.findByRole('complementary', { name: '패널' })
  expect(await within(panel).findByText(/오\*은/)).toBeVisible()      // 텅 빈 「환자」가 아니다
  expect(within(panel).getByText('2026-09-03 17:00')).toBeVisible()   // 미래 날짜 시각
  expect(within(panel).getByText('변경 상담')).toBeVisible()          // 상담 요약(SUPPORT-CAL-*)
})

test('[CAL-SLOT-06] 빈 구간을 누르면 오른쪽에 전화 예약 패널이 열린다', async () => {
  calendarOk()
  const user = userEvent.setup()
  renderPage()
  const grid = await screen.findByTestId('day-grid')
  const col = within(grid).getByTestId('column-d2') // 예약 없는 의사 열은 통째로 빈 시간
  await user.click(within(col).getByText(/빈 시간/))
  const panel = await screen.findByRole('complementary', { name: '패널' })
  expect(within(panel).getByRole('heading', { name: '전화 예약' })).toBeVisible()
})
