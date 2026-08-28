import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../AppShell'
import { ConnectivityProvider } from '../../lib/connectivity'
import { queryClient } from '../../lib/queryClient'
import { server } from '../../test/msw/server'
import { addDaysIso, hospitalInstant, hospitalMinutesOfDay, hospitalToday } from '../../lib/clock'
import { fmtDate } from './doorData'

// 예약 문(`SHELL-DOOR-02`) 배선 — 미래 방문(전화예약)을 실 서버에 잡는다.
//   로스터·하루 일정 = `GET /calendar` · 저장 = `POST /appointments/phone`.
//
// ⚠️ 좌표로 고르는 부분은 jsdom이 볼 수 없다(getBoundingClientRect가 전부 0이라 레인을 누르면
//    언제나 하루의 첫 시각 09:00이 잡힌다). 그 성질을 역이용해 「09:00 자리가 어떤 자리인가」로
//    세 판정(빈자리·빗금·겹침)을 가른다. **격자 위 어디를 눌렀나**는 브라우저에서 판정한다(계획 §1).
const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ staff, logout: vi.fn() }) }))
vi.mock('../../auth/useIdleLogout', () => ({ useIdleLogout: () => ({ isWarning: false, keepAlive: vi.fn() }) }))

const DOC = { id: 'doc-1', name: '이정훈', department_name: '내과', palette_index: null, slot_minutes: 20 }

/** 내일 — 「지난 시각」이 없는 날이라 09:00 판정이 시계에 흔들리지 않는다(`CAL-PAST-01`). */
function tomorrowIso(): string {
  return addDaysIso(hospitalToday(), 1)
}

interface CalendarStub {
  horizon?: string
  doctors?: typeof DOC[]
  appointments?: Array<{ patient_id: string; name?: string; appointment_id: string; doctor_id: string; status: string; start: string; end: string | null }>
  blocks?: Array<{ doctor_id: string; date: string; kind: 'closed' | 'lunch'; start: string | null; end: string | null; source: string }>
}

function serveCalendar(stub: CalendarStub = {}) {
  server.use(
    http.get('*/calendar', () =>
      HttpResponse.json({
        doctors: stub.doctors ?? [DOC],
        appointments: stub.appointments ?? [],
        blocks: stub.blocks ?? [],
        affected_appointment_ids: [],
        // [CAL-BOOK-13] 예약 가능한 마지막 날 — 화면이 「8주」를 박지 않게 서버가 준다.
        booking_horizon_date: stub.horizon ?? addDaysIso(hospitalToday(), 56),
      }),
    ),
  )
}

function serveDoctorWaiting(rows: Array<{ doctor_id: string; doctor_name: string; department_name: string; waiting_count: number }>) {
  server.use(
    http.get('*/today/summary', () =>
      HttpResponse.json({
        tiles: {}, long_wait: [], needs_attention: [], not_arrived: [], yesterday_unfinished: [],
        doctor_waiting: rows, badge_excluded_patient_ids: [],
      }),
    ),
  )
}

function servePatient(name: string) {
  server.use(
    http.get('*/patients', () =>
      HttpResponse.json({
        rows: [{
          patient_id: 'p1', name, masked_phone: '010-****-9930', masked_birth_date: '1972-**-03',
          gender: 'M', matched: ['name'], today_status: null, today_appointment_time: null,
        }],
        next_cursor: null,
        has_more: false,
      }),
    ),
  )
}

function renderShell() {
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <MemoryRouter initialEntries={['/queue']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/queue" element={<p>대기 목록 본문</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}

function panel() {
  return screen.getByRole('complementary', { name: '새 예약' })
}

type User = ReturnType<typeof userEvent.setup>

async function pickPatient(user: User) {
  servePatient('김태호')
  await user.click(screen.getByRole('button', { name: '예약' }))
  await user.click(screen.getByRole('textbox', { name: '환자 검색' }))
  await user.paste('김태호')
  await user.keyboard('{Enter}')
  await user.click(await waitFor(() => screen.getByRole('button', { name: /김태호/ })))
}

async function pickDoctor(user: User) {
  await user.click(await waitFor(() => within(panel()).getByRole('button', { name: /이정훈/ })))
}

/** 날짜를 내일로 옮긴다 — 달이 넘어가면 달 이동을 한 번 거친다(`CAL-NAV-01`). */
async function pickTomorrow(user: User) {
  const iso = tomorrowIso()
  await user.click(within(panel()).getByRole('button', { name: fmtDate(hospitalToday()) }))
  const [, m, d] = iso.split('-').map(Number)
  if (m !== Number(hospitalToday().split('-')[1])) {
    await user.click(screen.getByRole('button', { name: '다음 달' }))
  }
  await user.click(screen.getByRole('button', { name: String(d) }))
}

/** 레인을 누른다 — jsdom에서는 언제나 하루의 첫 시각(09:00)이 잡힌다(위 주석 참고). */
function clickLane() {
  fireEvent.click(screen.getByTestId('day-lane'))
}

async function fillToTime(user: User) {
  await pickPatient(user)
  await pickDoctor(user)
  await pickTomorrow(user)
  clickLane()
}

test('[SHELL-DOOR-02] 예약 문의 의사 목록은 실 서버 로스터다 — 화면이 의사를 들고 다니지 않는다', async () => {
  const user = userEvent.setup()
  serveCalendar({ doctors: [{ ...DOC, name: '한서연', department_name: '정형외과' }] })
  renderShell()
  await pickPatient(user)

  const row = await waitFor(() => within(panel()).getByRole('button', { name: /한서연/ }))
  expect(row).toHaveTextContent('정형외과')
})

test('[QUEUE-WALK-08b] 오늘을 고른 동안에는 의사마다 지금 대기 인원이 붙는다', async () => {
  const user = userEvent.setup()
  serveCalendar()
  serveDoctorWaiting([{ doctor_id: 'doc-1', doctor_name: '이정훈', department_name: '내과', waiting_count: 3 }])
  renderShell()
  await pickPatient(user)

  await waitFor(() => expect(within(panel()).getByRole('button', { name: /이정훈/ })).toHaveTextContent('대기 3명'))
})

test('[QUEUE-WALK-08b] 대기 목록에 없는 의사는 「대기 없음」이다 — 모르는 것이 아니라 0명이다', async () => {
  const user = userEvent.setup()
  serveCalendar()
  serveDoctorWaiting([]) // 아무도 기다리지 않는 아침
  renderShell()
  await pickPatient(user)

  await waitFor(() => expect(within(panel()).getByRole('button', { name: /이정훈/ })).toHaveTextContent('대기 없음'))
})

test('[QUEUE-WALK-08c] 다가올 날에는 대기 인원을 적지 않는다 — 오늘 몇 명인지는 그 날에 대해 말해 주는 것이 없다', async () => {
  const user = userEvent.setup()
  serveCalendar()
  serveDoctorWaiting([{ doctor_id: 'doc-1', doctor_name: '이정훈', department_name: '내과', waiting_count: 3 }])
  renderShell()
  await pickPatient(user)
  await pickDoctor(user)
  await pickTomorrow(user)
  await user.click(within(panel()).getByRole('button', { name: /이정훈 선생님/ }))

  const row = await waitFor(() => within(panel()).getAllByRole('button', { name: /이정훈/ }).at(-1)!)
  expect(row).not.toHaveTextContent('대기')
})

test('[CAL-TIME-09] 진료 길이는 서버 카탈로그가 준 그 날 요일의 값이다 — 화면이 추측하지 않는다', async () => {
  const user = userEvent.setup()
  serveCalendar({ doctors: [{ ...DOC, slot_minutes: 20 }] }) // 예약이 하나도 없는 날이라 도출은 실패한다
  renderShell()
  await pickPatient(user)
  await pickDoctor(user)

  expect(await screen.findByText(/20분 진료/)).toBeVisible()
})

test('[CAL-SLOT-02] 왼쪽 캘린더에는 그 의사의 실제 예약이 이름과 상태 글자로 그려진다', async () => {
  const user = userEvent.setup()
  const iso = tomorrowIso()
  serveCalendar({
    appointments: [
      { patient_id: 'p9', name: '정우성', appointment_id: 'a1', doctor_id: 'doc-1', status: 'confirmed', start: `${iso}T10:20:00+09:00`, end: `${iso}T10:40:00+09:00` },
    ],
  })
  renderShell()
  await pickPatient(user)
  await pickDoctor(user)
  await pickTomorrow(user)

  expect(await screen.findByText('정우성')).toBeVisible()
  expect(screen.getByText('확정')).toBeVisible()
})

test('[CAL-BOOK-08] 저장 직전 한 번 더 묻고, 확정하면 전화예약 창구로 저장한다', async () => {
  const user = userEvent.setup()
  const iso = tomorrowIso()
  serveCalendar()
  let body: Record<string, unknown> | null = null
  server.use(
    http.post('*/appointments/phone', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ appointment_id: 'new-1' })
    }),
  )
  renderShell()
  await fillToTime(user)

  await user.click(within(panel()).getByRole('button', { name: '예약하기' }))
  expect(screen.getByText('이 내용으로 예약할까요?')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '예약 확정' }))

  await waitFor(() => expect(body).not.toBeNull())
  expect(body).toMatchObject({
    patient_id: 'p1',
    doctor_id: 'doc-1',
    // 병원 09:00을 못박아 보낸다(TIME-TZ-01) — 오프셋 없는 문자열은 서버 설정에 기댄다.
    start_at: hospitalInstant(iso, 9, 0).toISOString(),
    allow_overlap: false,
  })
})

test('[CAL-GAP-05][CAL-GAP-06] 겹치면 누구와 몇 분인지 적고, 「그대로 잡기」는 겹침을 허용해 저장한다', async () => {
  const user = userEvent.setup()
  const iso = tomorrowIso()
  serveCalendar({
    appointments: [
      // 09:10~09:30 — 09:00에 20분을 잡으면 10분 겹친다.
      { patient_id: 'p9', name: '정우성', appointment_id: 'a1', doctor_id: 'doc-1', status: 'confirmed', start: `${iso}T09:10:00+09:00`, end: `${iso}T09:30:00+09:00` },
    ],
  })
  let body: Record<string, unknown> | null = null
  server.use(
    http.post('*/appointments/phone', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ appointment_id: 'new-1' })
    }),
  )
  renderShell()
  await fillToTime(user)
  await user.click(within(panel()).getByRole('button', { name: '예약하기' }))

  const dialog = screen.getByRole('dialog', { name: '끼워넣기 경고' })
  expect(dialog).toHaveTextContent('이 자리는 10분입니다')
  expect(dialog).toHaveTextContent('정우성 님 09:10')
  expect(dialog).toHaveTextContent('10분 겹칩니다')

  await user.click(within(dialog).getByRole('button', { name: '알겠습니다, 그대로 잡기' }))
  await waitFor(() => expect(body).not.toBeNull())
  expect(body).toMatchObject({ allow_overlap: true })
})

test('[CAL-SLOT-04] 빗금은 못 잡는 구간이다 — 경고가 아니라 막고, 저장 창구를 부르지 않는다', async () => {
  const user = userEvent.setup()
  const iso = tomorrowIso()
  serveCalendar({ blocks: [{ doctor_id: 'doc-1', date: iso, kind: 'lunch', start: '09:00:00', end: '10:00:00', source: 'rule' }] })
  let called = false
  server.use(http.post('*/appointments/phone', () => { called = true; return HttpResponse.json({ appointment_id: 'x' }) }))
  renderShell()
  await pickPatient(user)
  await pickDoctor(user)
  await pickTomorrow(user)
  clickLane() // 09:00 = 점심시간

  expect(await screen.findByText(/점심시간 시간이라 예약을 잡을 수 없습니다|점심시간 시간이라 잡을 수 없습니다/)).toBeVisible()
  expect(within(panel()).getByRole('button', { name: '예약하기' })).toBeDisabled()
  expect(called).toBe(false)
})

test('[CAL-PAST-01][CAL-PAST-02] 지난 시각은 「지난 시간」이라 글자로 적고, 막다른 길 대신 당일 방문 등록으로 잇는다', async () => {
  const user = userEvent.setup()
  serveCalendar()
  renderShell()
  await pickPatient(user)
  await pickDoctor(user)
  // 날짜는 기본값 그대로 **오늘**이다 — 09:00은 이 시각 이후에 열리면 이미 지난 시각이다.
  await user.click(within(panel()).getByRole('button', { name: '시각을 고르세요' }))
  clickLane()

  // ⭐ 화면이 병원 시계를 보므로(TIME-TZ-01) 판정도 병원 시각으로 한다 — 기계 시각으로 재면
  //    미 서부 오전 10시(=KST 새벽 2시)에 「09:00은 지난 시각」이라 잘못 기대하게 된다.
  if (hospitalMinutesOfDay() > 9 * 60) {
    expect(await screen.findByText('이미 지난 시간입니다.')).toBeVisible()
    expect(screen.getByRole('button', { name: '당일 방문 등록' })).toBeVisible()
    expect(screen.getByText('지난 시간')).toBeVisible()
  } else {
    // 오전 9시 이전에 돌린 경우 — 지난 시각이 아직 없다.
    expect(screen.queryByText('이미 지난 시간입니다.')).toBeNull()
  }
})

test('[CAL-RACE-03][CAL-RACE-04] 방금 다른 직원이 잡았으면 시각 칸만 비우고 패널은 그대로 남는다', async () => {
  const user = userEvent.setup()
  serveCalendar()
  server.use(http.post('*/appointments/phone', () => HttpResponse.json({ detail: '이미 예약된 시각입니다' }, { status: 409 })))
  renderShell()
  await fillToTime(user)
  await user.click(within(panel()).getByRole('button', { name: '예약하기' }))
  await user.click(screen.getByRole('button', { name: '예약 확정' }))

  expect(await screen.findByText(/방금 다른 직원이 이 자리를 잡았습니다/)).toBeVisible()
  // 패널은 살아 있고 환자·의사는 그대로 — 시각만 비었다.
  expect(within(panel()).getByText('김태호')).toBeVisible()
  expect(within(panel()).getByRole('button', { name: '시각을 고르세요' })).toBeVisible()
})

test('[CAL-BOOK-13] 예약 가능한 마지막 날 뒤로는 달을 넘길 수 없고, 언제까지인지 적는다', async () => {
  const user = userEvent.setup()
  // 경계를 **오늘**로 둔다 — 그러면 [다음 달]이 곧바로 막히고, 월말이라 +3일이 다음 달로
  // 넘어가는 경우에 흔들리지 않는다.
  const horizon = hospitalToday()
  serveCalendar({ horizon })
  renderShell()
  await pickPatient(user)
  await user.click(within(panel()).getByRole('button', { name: fmtDate(hospitalToday()) }))

  expect(await screen.findByRole('button', { name: '다음 달' })).toBeDisabled()
  // 막을 때는 이유를 함께 준다 — 「8주」가 아니라 **그 날짜**로 적는다(직원이 계산하지 않게).
  expect(screen.getByText(`예약은 ${fmtDate(horizon)}까지 가능합니다`)).toBeVisible()
})

test('[CAL-BOOK-13] 경계 너머 날짜는 고를 수 없다', async () => {
  const user = userEvent.setup()
  const horizon = hospitalToday()
  serveCalendar({ horizon })
  renderShell()
  await pickPatient(user)
  await user.click(within(panel()).getByRole('button', { name: fmtDate(hospitalToday()) }))

  const beyond = addDaysIso(horizon, 1)
  const [, , d] = beyond.split('-').map(Number)
  // 같은 달 안에 있을 때만 볼 수 있다(달을 넘어가면 그 달 자체를 못 연다).
  if (beyond.slice(0, 7) === hospitalToday().slice(0, 7)) {
    expect(await screen.findByRole('button', { name: String(d) })).toBeDisabled()
  }
})
