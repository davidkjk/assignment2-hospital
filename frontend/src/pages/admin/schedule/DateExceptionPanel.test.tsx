import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DateExceptionPanel, type SaveExceptionInput } from './DateExceptionPanel'
import type { DateException } from './types'

const CAL_DAYS = [
  { date: '2026-08-16', label: '16', inMonth: true, hasException: false }, // 일요일 정기 휴진 — 점 없음
  { date: '2026-08-17', label: '17', inMonth: true, hasException: true },
  { date: '2026-08-18', label: '18', inMonth: true, hasException: false },
]

const DAY_DOCTORS = [
  { id: 'd1', name: '박지훈', regularDayOff: false, appointmentCount: 4 },
  { id: 'd2', name: '한소연', regularDayOff: true, appointmentCount: 0 },
]

function exc(over: Partial<DateException>): DateException {
  return {
    id: 'e1',
    exception_date: '2026-08-17',
    scope: 'doctor',
    doctor_id: 'd1',
    doctor_name: '박지훈',
    is_closed: true,
    override_start: null,
    override_end: null,
    memo: null,
    affected_count: 0,
    ...over,
  }
}

function renderPanel(config: { dayExceptions?: DateException[]; onSave?: (i: SaveExceptionInput) => Promise<{ affected: number }> } = {}) {
  const onSave = config.onSave ?? vi.fn(async (_i: SaveExceptionInput) => ({ affected: 0 }))
  const onRevert = vi.fn(async (_id: string) => {})
  function Harness() {
    const [entries, setEntries] = useState<DateException[]>(config.dayExceptions ?? [])
    return (
      <DateExceptionPanel
        monthLabel="2026년 8월"
        calendarDays={CAL_DAYS}
        selectedDate="2026-08-17"
        onSelectDate={vi.fn()}
        dayDoctors={DAY_DOCTORS}
        dayExceptions={entries}
        onSave={onSave}
        onRevert={async (id) => {
          await onRevert(id)
          setEntries((prev) => prev.filter((e) => e.id !== id))
        }}
      />
    )
  }
  render(<Harness />)
  return { onSave, onRevert }
}

const calendarDot = (date: string) => document.querySelector(`[data-cal-dot="${date}"]`)
const scopeOptions = () => Array.from(document.querySelectorAll('input[name="exc-scope"]')).map((r) => r.closest('label')!.textContent!.trim())
const exceptionFields = () => Array.from(document.querySelectorAll('input[name="exc-type"]')).map((r) => r.closest('label')!.textContent!.trim())
const doctorRow = (name: string) => document.querySelector(`[data-doctor-row="${name}"]`) as HTMLElement
const hospitalRow = () => document.querySelector('[data-hospital-row="true"]') as HTMLElement
const affectedCount = () => Number(screen.getByTestId('affected-count').textContent)
const entryRow = (date: string) => document.querySelector(`[data-entry-date="${date}"]`) as HTMLElement

test('[SCHED-EXC-01][SCHED-EXC-02] 등록된 날에만 ● — 정기 휴진은 표시하지 않는다', () => {
  renderPanel()
  expect(calendarDot('2026-08-17')).toBeVisible()
  expect(calendarDot('2026-08-16')).toBeNull() // 일요일 정기 휴진
})

test('[SCHED-EXC-03][SCHED-EXC-04][SCHED-EXC-05] 「병원 전체」와 「의사 고르기」 두 갈래, 의사는 여러 명 체크', async () => {
  const user = userEvent.setup()
  renderPanel()
  expect(scopeOptions()).toEqual(['병원 전체', '의사 고르기'])
  await user.click(screen.getByLabelText('병원 전체'))
  expect(screen.getByLabelText('메모')).toHaveValue('병원 지정 휴무일')
  await user.click(screen.getByLabelText('의사 고르기'))
  expect(screen.getByRole('button', { name: '전체 선택' })).toBeVisible()
})

test('[SCHED-EXC-06] 그 요일이 이미 정기 휴진인 의사는 회색이고 고를 수 없다', async () => {
  const user = userEvent.setup()
  renderPanel()
  await user.click(screen.getByLabelText('의사 고르기'))
  expect(screen.getByLabelText('한소연')).toBeDisabled()
})

test('[SCHED-EXC-07] 이름 옆에 그 날 예약 건수를 적는다', async () => {
  const user = userEvent.setup()
  renderPanel()
  await user.click(screen.getByLabelText('의사 고르기'))
  expect(doctorRow('박지훈')).toHaveTextContent('예약 4건')
})

test('[SCHED-EXC-08][SCHED-EXC-08b][갭 #94] 담는 것은 종일 휴진·시간 변경 둘뿐이다', () => {
  renderPanel()
  expect(exceptionFields()).toEqual(['종일 휴진', '진료 시간 변경'])
})

test('[SCHED-EXC-09][SCHED-EXC-11] 병원 휴무와 의사 지정이 겹치면 덮였다는 사실이 보인다', () => {
  renderPanel({
    dayExceptions: [
      exc({ id: 'h1', scope: 'hospital', doctor_id: null, doctor_name: null, is_closed: true, memo: '병원 지정 휴무일' }),
      exc({ id: 'x1', scope: 'doctor', doctor_id: 'd1', doctor_name: '박지훈', is_closed: false }),
    ],
  })
  expect(hospitalRow()).toHaveTextContent('— 아래에서 덮인 사람 있음')
  expect(doctorRow('박지훈')).toHaveTextContent('병원 휴무일이지만 이 사람은 나온다')
})

test('[SCHED-EXC-13][SCHED-EXC-14] 되돌리면 영향이 0건이 되고, [되돌리기]는 그 줄만 지운다', async () => {
  const user = userEvent.setup()
  const { onRevert } = renderPanel({ dayExceptions: [exc({ id: 'e17', affected_count: 2 })] })
  await user.click(within(entryRow('2026-08-17')).getByRole('button', { name: '되돌리기' }))
  expect(affectedCount()).toBe(0)
  expect(onRevert).toHaveBeenCalledWith('e17')
})

test('[SCHED-EXC-15] 저장 전 경고는 0건이면 안 뜬다', async () => {
  const user = userEvent.setup()
  renderPanel({ onSave: vi.fn(async () => ({ affected: 0 })) })
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
