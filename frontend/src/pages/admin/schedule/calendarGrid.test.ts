import { expect, test } from 'vitest'
import { buildMonthGrid } from './calendarGrid'

test('[SCHED-EXC-01] 6주 42칸을 만들고, 그 달 날은 inMonth로 표시한다', () => {
  const grid = buildMonthGrid(2026, 8, new Set())
  expect(grid).toHaveLength(42)
  const inMonth = grid.filter((d) => d.inMonth)
  expect(inMonth).toHaveLength(31) // 8월은 31일
  expect(inMonth[0].date).toBe('2026-08-01')
  expect(inMonth[30].date).toBe('2026-08-31')
})

test('[SCHED-EXC-01] 격자 첫 칸은 월요일 시작이라 그 달 1일의 요일만큼 이웃 달로 넘어간다', () => {
  // 2026-08-01은 토요일 → 월요일 시작 격자에서 앞 5칸(월~금)은 7월 말일들.
  const grid = buildMonthGrid(2026, 8, new Set())
  expect(grid[0].date).toBe('2026-07-27') // 월요일
  expect(grid[0].inMonth).toBe(false)
  expect(grid[5].date).toBe('2026-08-01') // 토요일 = 그 달 1일
  expect(grid[5].inMonth).toBe(true)
})

test('[SCHED-EXC-02] 변경이 등록된 날에만 hasException이 켜진다', () => {
  const grid = buildMonthGrid(2026, 8, new Set(['2026-08-17']))
  expect(grid.find((d) => d.date === '2026-08-17')!.hasException).toBe(true)
  expect(grid.find((d) => d.date === '2026-08-18')!.hasException).toBe(false)
})

test('[SCHED-EXC-01] 12월은 이듬해 1월로 안전하게 넘어간다(연도 경계)', () => {
  const grid = buildMonthGrid(2026, 12, new Set())
  const inMonth = grid.filter((d) => d.inMonth)
  expect(inMonth[0].date).toBe('2026-12-01')
  expect(inMonth[inMonth.length - 1].date).toBe('2026-12-31')
  // 격자 꼬리는 이듬해 1월로 넘어간다.
  expect(grid[grid.length - 1].date.startsWith('2027-01')).toBe(true)
})
