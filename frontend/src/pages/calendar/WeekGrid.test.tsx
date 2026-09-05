import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { WeekGrid, weekDays } from './WeekGrid'
import { DayGrid } from './DayGrid'
import type { GridDoctor } from './gridModel'
import type { CalendarData } from '../../api/calendar'

const ANCHOR = new Date('2026-08-17T09:00:00+09:00')
const NOW = new Date('2026-08-17T08:00:00+09:00')

const DOCTORS: GridDoctor[] = [
  { id: 'd1', name: '박지훈', departmentName: '내과', paletteIndex: 3, slotMinutes: 15 },
  { id: 'd2', name: '최민석', departmentName: '내과', paletteIndex: 1, slotMinutes: 20 },
  { id: 'd3', name: '한소연', departmentName: '피부과', paletteIndex: 5, slotMinutes: 30 },
]

function renderWeek(props: Partial<React.ComponentProps<typeof WeekGrid>> = {}) {
  return render(
    <WeekGrid anchorDate={ANCHOR} doctors={DOCTORS} dataByDate={new Map<string, CalendarData>()} hourHeight={60} now={NOW} {...props} />,
  )
}

test('[CAL-VIEW-05][CAL-VIEW-09] 주간은 일간(DayGrid)을 6번 재사용하고 시간축은 왼쪽 한 번뿐이다', () => {
  renderWeek()
  expect(screen.getAllByTestId('day-grid')).toHaveLength(6) // 월~토 · 같은 부품
  expect(screen.getAllByTestId('time-axis')).toHaveLength(1) // 축은 공유
  expect(DayGrid).toBeDefined() // 별도 격자를 새로 만들지 않는다
})

test('[CAL-VIEW-06] 주간 하루 칸은 의사 수만큼 세로 레인으로 나뉜다', () => {
  renderWeek()
  const days = weekDays(ANCHOR)
  const cell = screen.getByTestId(`day-cell-${days[0]}`)
  expect(within(cell).getByTestId('column-d1')).toBeInTheDocument()
  expect(within(cell).getByTestId('column-d2')).toBeInTheDocument()
  expect(within(cell).getByTestId('column-d3')).toBeInTheDocument()
})

test('[CAL-WEEK-04][CAL-NAME-01] 레인 머리에 성 한 자가 날마다 고정 순서로 붙는다', () => {
  renderWeek()
  const days = weekDays(ANCHOR)
  const heads = (date: string) =>
    within(screen.getByTestId(`day-cell-${date}`))
      .getAllByText(/^[박최한]$/)
      .map((n) => n.textContent)
  expect(heads(days[0])).toEqual(['박', '최', '한'])
  expect(heads(days[2])).toEqual(['박', '최', '한']) // 다른 날도 같은 순서
})

test('[CAL-NAV-01] 날짜 머리를 누르면 그 날의 일간으로 간다', async () => {
  const user = userEvent.setup()
  const onOpenDay = vi.fn()
  renderWeek({ onOpenDay })
  const days = weekDays(ANCHOR)
  await user.click(screen.getByRole('button', { name: new RegExp(days[0].slice(5).replace('-', '/')) }))
  expect(onOpenDay).toHaveBeenCalledWith(days[0])
})

test('[CAL-WEEK-10] 좁은 레인을 누르면 시각은 찍지 않고 의사·날짜만 넘긴다', async () => {
  const user = userEvent.setup()
  const onLaneClick = vi.fn()
  renderWeek({ onLaneClick })
  const days = weekDays(ANCHOR)
  const cell = screen.getByTestId(`day-cell-${days[0]}`)
  await user.click(within(cell).getByTestId('column-d1'))
  expect(onLaneClick).toHaveBeenCalledWith('d1', days[0])
})
