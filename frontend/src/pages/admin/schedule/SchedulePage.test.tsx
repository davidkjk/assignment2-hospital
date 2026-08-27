import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, test } from 'vitest'
import { server } from '../../../test/msw/server'
import { AuthProvider } from '../../../auth/AuthProvider'
import { SchedulePage } from './SchedulePage'
import type { OverviewDoctor, WeekRow } from './types'

function day(w: number): WeekRow {
  return { weekday: w, is_day_off: false, start: '09:00:00', end: '18:00:00', slot_minutes: 15, lunch_start: '12:00:00', lunch_end: '13:00:00', max_daily: 40, booking_deadline: '17:00:00' }
}
function doc(id: string, name: string, department: string): OverviewDoctor {
  return { doctor_id: id, name, department, days: Array.from({ length: 7 }, (_, w) => day(w)) }
}

function mockAll() {
  server.use(
    http.get('*/admin/schedule/overview', () =>
      HttpResponse.json([doc('d1', '박지훈', '내과'), doc('d2', '최민석', '정형외과'), doc('d3', '한소연', '가정의학과'), doc('d4', '김민수', '이비인후과')]),
    ),
    http.get('*/admin/departments', () =>
      HttpResponse.json([
        { id: 'dep1', name: '내과', is_active: true },
        { id: 'dep2', name: '정형외과', is_active: true },
        { id: 'dep3', name: '가정의학과', is_active: true },
        { id: 'dep4', name: '이비인후과', is_active: true },
      ]),
    ),
    http.get('*/admin/hours', () =>
      HttpResponse.json(
        Array.from({ length: 7 }, (_, w) => ({
          weekday: w,
          is_closed: w === 6,
          open_time: w === 6 ? null : '09:00:00',
          close_time: w === 6 ? null : '18:00:00',
          lunch_start: w === 6 ? null : '12:00:00',
          lunch_end: w === 6 ? null : '13:00:00',
        })),
      ),
    ),
    http.get('*/admin/closures', () => HttpResponse.json([{ closure_date: '2026-02-09', memo: '설날' }])),
    http.post('*/admin/schedule/doctors/*/regenerate', () => HttpResponse.json({ removed: 0, added: 0 })),
  )
}

function renderPage(role: 'admin' | 'receptionist' = 'admin') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/schedule']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider initialAuth={{ session: { access_token: 't' }, staff: { staffId: 's1', name: '관리자', email: 'a@h.kr', role, departmentId: null, departmentName: null } }}>
          <Routes>
            <Route path="/admin/schedule" element={<SchedulePage />} />
            <Route path="/today" element={<div>오늘의 현황</div>} />
            <Route path="/admin/staff" element={<div>직원 관리</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const railItems = () => Array.from(document.querySelectorAll('[data-rail]')).map((el) => el.getAttribute('data-rail'))
const railSubtitles = () => Array.from(document.querySelectorAll('[data-rail-sub]')).map((el) => el.textContent)
const activeRail = () => document.querySelector('[data-rail][aria-current="page"]')?.getAttribute('data-rail')
const railItem = (label: string) => document.querySelector(`[data-rail="${label}"]`) as HTMLElement
const contentArea = () => document.querySelector('section[aria-label]') as HTMLElement
const gridCell = (name: string, short: string) => document.querySelector(`[data-cell="${name}|${short}"]`) as HTMLElement
const selectedDoctor = () => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-chip')
const focusedRow = () => document.querySelector('[data-focused="true"]')?.getAttribute('data-row')

beforeEach(() => mockAll())

async function waitLoaded() {
  await waitFor(() => expect(railSubtitles()[1]).toBe('4과'))
}

test('[SCHED-TAB-01][SCHED-TAB-03] 왼쪽 세로줄 다섯 줄이고 화면 수를 아끼려 묶지 않는다', async () => {
  renderPage()
  await waitLoaded()
  expect(railItems()).toEqual(['전체 현황', '진료과 관리', '의사별 스케줄', '특정 날짜 변경', '병원 운영시간'])
})

test('[SCHED-TAB-01b] 세로줄에 놓인 것은 무슨 일을 하는 곳이지 누구의 것이 아니다', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitLoaded()
  expect(railItems()).not.toContain('박지훈')
  await user.click(railItem('의사별 스케줄'))
  expect(within(contentArea()).getByRole('tablist', { name: '의사' })).toBeVisible()
})

test('[SCHED-TAB-01c] 줄마다 부제목에 지금 상태가 한 줄로 들어간다', async () => {
  renderPage()
  await waitLoaded()
  expect(railSubtitles()).toEqual(['읽는 곳', '4과', '의사 4명', '다음 휴무 2/9', '평일 09:00~18:00 / 일요일 휴무'])
})

test('[SCHED-TAB-02] 첫 줄은 늘 「전체 현황」 — 마지막에 보던 줄을 기억하지 않는다', async () => {
  const user = userEvent.setup()
  const { unmount } = renderPage()
  await waitLoaded()
  await user.click(railItem('의사별 스케줄'))
  expect(activeRail()).toBe('의사별 스케줄')
  unmount()
  renderPage()
  await waitLoaded()
  expect(activeRail()).toBe('전체 현황')
})

test('[SCHED-TAB-04b] 줄 이름은 「특정 날짜 변경」이고 「특정일 예외」를 쓰지 않는다', async () => {
  renderPage()
  await waitLoaded()
  expect(railItems().some((i) => /예외/.test(i ?? ''))).toBe(false)
})

test('[SCHED-TAB-05][ROLE-ADM-03] 관리자가 아니면 화면 자체가 보이지 않는다', () => {
  renderPage('receptionist')
  expect(screen.getByText('이 화면을 볼 권한이 없습니다')).toBeVisible()
})

test('[SCHED-GRID-03] 칸을 누르면 그 의사·그 요일이 선택된 채 「의사별 스케줄」로 옮겨간다', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitLoaded()
  await user.click(gridCell('최민석', '수'))
  expect(activeRail()).toBe('의사별 스케줄')
  expect(selectedDoctor()).toBe('최민석')
  expect(focusedRow()).toBe('수요일')
})

test('[SCHED-SAVE-02c] 값을 고치면 세로줄 「의사별 스케줄」에도 ●가 붙는다', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitLoaded()
  await user.click(railItem('의사별 스케줄'))
  const maxInput = document.querySelector('[data-cell2="월요일|하루 최대 인원"]') as HTMLInputElement
  await user.clear(maxInput)
  await user.type(maxInput, '50')
  await user.click(railItem('진료과 관리'))
  expect(railItem('의사별 스케줄')).toHaveTextContent('●')
})

test('[SCHED-SAVE-07][PANEL-ONE-01] 저장 전에 화면을 떠나도 묻지 않는다', async () => {
  const user = userEvent.setup()
  renderPage()
  await waitLoaded()
  await user.click(railItem('의사별 스케줄'))
  const maxInput = document.querySelector('[data-cell2="월요일|하루 최대 인원"]') as HTMLInputElement
  await user.clear(maxInput)
  await user.type(maxInput, '50')
  await user.click(railItem('전체 현황'))
  expect(screen.queryByRole('dialog')).toBeNull() // 묻지 않고, 확인창을 대신 넣지도 않는다
})

test('[SCHED-HOURS-01][SCHED-HOURS-02] 병원 운영시간은 설정이 아니라 이 화면 다섯째 줄에 있다', async () => {
  renderPage()
  await waitLoaded()
  expect(railItems()[4]).toBe('병원 운영시간')
})
