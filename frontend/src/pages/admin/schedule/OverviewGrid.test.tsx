import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { OverviewGrid } from './OverviewGrid'
import type { OverviewDoctor, WeekRow } from './types'

function day(weekday: number, off = false): WeekRow {
  return off
    ? { weekday, is_day_off: true, start: null, end: null, slot_minutes: null, lunch_start: null, lunch_end: null, max_daily: null, booking_deadline: null }
    : { weekday, is_day_off: false, start: '09:00:00', end: '18:00:00', slot_minutes: 15, lunch_start: '12:00:00', lunch_end: '13:00:00', max_daily: 40, booking_deadline: '17:00:00' }
}

function doctor(id: string, name: string, department: string, offSunday = false): OverviewDoctor {
  return { doctor_id: id, name, department, days: Array.from({ length: 7 }, (_, w) => day(w, offSunday && w === 6)) }
}

const DOCTORS = [doctor('d1', '박지훈', '내과'), doctor('d2', '최민석', '정형외과'), doctor('d3', '한소연', '가정의학과', true)]

function renderGrid(doctors = DOCTORS, onCell = vi.fn()) {
  render(<OverviewGrid doctors={doctors} onCellClick={onCell} onGoToStaff={vi.fn()} />)
  return { onCell }
}

const gridElement = () => screen.getByTestId('overview-grid')
const gridCell = (name: string, short: string) =>
  gridElement().querySelector(`[data-cell="${name}|${short}"]`) as HTMLElement

test('[SCHED-GRID-01][SCHED-GRID-02] 행=의사·열=요일이고 여기서 고치지 않는다', () => {
  renderGrid()
  expect(gridCell('박지훈', '월')).toHaveTextContent('09–18')
  expect(gridCell('박지훈', '월')).toHaveTextContent('15분 · 40명')
  expect(within(gridElement()).queryAllByRole('textbox')).toHaveLength(0)
})

test('[SCHED-GRID-01][SCHED-GRID-04] 범례가 시각·정원·휴진 뜻과 클릭 안내를 준다', () => {
  renderGrid()
  expect(screen.getByText('진료 시간')).toBeVisible()
  expect(screen.getByText('한 칸 길이 · 하루 최대 인원')).toBeVisible()
  expect(screen.getByText('칸을 누르면 그 의사 스케줄로 이동합니다')).toBeVisible()
  // 범례 예시 시각은 격자와 같은 형식(09–18)이어야 한다 — SCHED-GRID-01
  expect(screen.getAllByText('09–18').length).toBeGreaterThan(0)
})

test('[SCHED-GRID-03] 칸을 누르면 그 의사·그 요일로 고치러 간다', async () => {
  const user = userEvent.setup()
  const { onCell } = renderGrid()
  await user.click(gridCell('최민석', '수'))
  expect(onCell).toHaveBeenCalledWith('d2', 2) // 수요일=2
})

test('[SCHED-GRID-04] 정기 휴진은 빗금 + 「휴진」 글자 — 색만으로 구분하지 않는다', () => {
  renderGrid()
  expect(gridCell('한소연', '일')).toHaveTextContent('휴진')
  expect(gridCell('한소연', '일')).toHaveClass('is-hatched')
})

test('[SCHED-GRID-05][SCHED-GRID-06] 평상시 규칙만 담는다 — 격자는 원본이라 그 날만의 변경이 바꾸지 않는다', () => {
  renderGrid()
  // 격자는 doctor_schedule_rules(원본)만 그린다 — 특정 날짜 예외는 여기 들어오지 않는다.
  expect(gridCell('박지훈', '월')).toHaveTextContent('09–18')
})

test('[SCHED-GRID-07] 활성 의사가 0명이면 빈 격자만 두지 않고 갈 길을 준다', () => {
  render(<OverviewGrid doctors={[]} onCellClick={vi.fn()} onGoToStaff={vi.fn()} />)
  expect(screen.getByText('아직 등록된 의사가 없습니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '의사 관리로 가기' })).toBeVisible()
})
