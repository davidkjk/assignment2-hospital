import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, expect, test, vi } from 'vitest'
import { HospitalHoursTable, type HoursMismatch } from './HospitalHoursTable'
import type { HospitalHoursRow } from './types'

// InlineError가 useEffect에서 scrollIntoView를 부른다 — jsdom엔 없어 스텁한다.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const FULL: Record<string, string> = { 월: '월요일', 화: '화요일', 수: '수요일', 목: '목요일', 금: '금요일', 토: '토요일', 일: '일요일' }

function hrow(w: number, o: Partial<HospitalHoursRow> = {}): HospitalHoursRow {
  return {
    weekday: w,
    is_closed: o.is_closed ?? false,
    open_time: 'open_time' in o ? o.open_time! : '09:00:00',
    close_time: 'close_time' in o ? o.close_time! : '18:00:00',
    lunch_start: 'lunch_start' in o ? o.lunch_start! : '12:00:00',
    lunch_end: 'lunch_end' in o ? o.lunch_end! : '13:00:00',
  }
}

function week(over: Record<number, Partial<HospitalHoursRow>> = {}): HospitalHoursRow[] {
  return Array.from({ length: 7 }, (_, w) => hrow(w, over[w] ?? {}))
}

function renderHours(config: { hours?: HospitalHoursRow[]; mismatch?: HoursMismatch | null; onSave?: Props['onSave']; onGoToWeekly?: (id: string) => void } = {}) {
  const onSave = config.onSave ?? vi.fn(async () => ({}))
  const onRefetch = vi.fn()
  const onGoToWeekly = config.onGoToWeekly ?? vi.fn()
  const utils = render(
    <HospitalHoursTable
      hours={config.hours ?? week()}
      mismatch={config.mismatch ?? null}
      onSave={onSave}
      onRefetch={onRefetch}
      onGoToWeekly={onGoToWeekly}
    />,
  )
  return { onSave, onRefetch, onGoToWeekly, utils }
}
type Props = Parameters<typeof HospitalHoursTable>[0]

const rowOf = (short: string) => document.querySelector(`[data-hours-row="${short}"]`) as HTMLElement
const closedCheckbox = (short: string) => within(rowOf(short)).getByRole('checkbox', { name: new RegExp(`${FULL[short]} 휴무`) })
const timeInput = (short: string, which: '시작' | '종료') => screen.getByLabelText(`${FULL[short]} ${which}`) as HTMLInputElement
const fieldError = (short: string, which: '종료' | '점심') => screen.getByTestId(`err-${FULL[short]}-${which}`).textContent

test('[SCHED-HOURS-03][SCHED-HOURS-04] 이 값은 접수 창구 시간이고 의사 진료시간과 다르다고 표 아래에 적는다', () => {
  renderHours()
  expect(screen.getByText(/의사별 진료시간은 「의사별 스케줄」에서 따로 정합니다/)).toBeVisible()
})

test('[SCHED-HOURS-05] 병원 점심은 의사 점심과 다른 값이고 자동 계산하지 않는다 — 직접 고친 값이 남는다', async () => {
  const user = userEvent.setup()
  renderHours()
  const lunchStart = screen.getByLabelText('월요일 점심 시작') as HTMLInputElement
  await user.clear(lunchStart)
  await user.type(lunchStart, '1130')
  expect(lunchStart).toHaveValue('11:30') // 병원이 스스로 정한다
})

test('[SCHED-HOURS-06][SCHED-HOURS-07][SCHED-HOURS-08] 휴무 체크박스가 칸을 잠그고 해제하면 이전 값이 돌아온다', async () => {
  const user = userEvent.setup()
  renderHours()
  await user.click(closedCheckbox('일'))
  expect(rowOf('일')).toHaveTextContent('── 휴무일 ──')
  await user.click(closedCheckbox('일'))
  expect(timeInput('일', '시작')).toHaveValue('09:00')
})

test('[SCHED-HOURS-09][SCHED-HOURS-11] 잘못된 시각은 인라인 오류이고 저장 버튼을 비활성으로 만들지 않는다', async () => {
  const user = userEvent.setup()
  renderHours()
  await user.clear(timeInput('월', '시작'))
  await user.type(timeInput('월', '시작'), '1800')
  await user.clear(timeInput('월', '종료'))
  await user.type(timeInput('월', '종료'), '0900')
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(fieldError('월', '종료')).toBe('닫는 시간이 여는 시간보다 이릅니다')
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  expect(document.activeElement).toBe(timeInput('월', '종료'))
})

test('[SCHED-HOURS-12] 월요일 값 복사는 화~토까지 (일요일=휴무만 제외)', async () => {
  const user = userEvent.setup()
  renderHours({ hours: week({ 5: { open_time: null, close_time: null, lunch_start: null, lunch_end: null }, 6: { open_time: null, close_time: null, lunch_start: null, lunch_end: null } }) })
  await user.click(screen.getByRole('button', { name: '월요일 값을 나머지에' }))
  expect(timeInput('화', '시작')).toHaveValue('09:00')
  expect(timeInput('토', '시작')).toHaveValue('09:00') // 병원 월~토 진료 → 토요일도 복사(L36)
  expect(timeInput('일', '시작')).toHaveValue('')       // 일요일=휴무만 제외
})

test('[SCHED-HOURS-13] 저장 중에는 버튼이 비활성이다 (두 번 눌리는 것 막기)', async () => {
  const user = userEvent.setup()
  let resolve: (v: { conflict?: boolean }) => void = () => {}
  const onSave = vi.fn(() => new Promise<{ conflict?: boolean }>((r) => (resolve = r)))
  renderHours({ onSave })
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  await act(async () => {
    resolve({})
  })
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
})

test('[SCHED-HOURS-14] 다른 관리자가 먼저 고치면 409 배너 + 자동 재조회', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn(async () => ({ conflict: true }))
  const { onRefetch } = renderHours({ onSave })
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getByRole('status')).toHaveTextContent(/다른 관리자가 먼저/)
  expect(onRefetch).toHaveBeenCalledTimes(1)
})

const MISMATCH: HoursMismatch = {
  weekday: 5,
  doctorEndLabel: '18:00',
  hoursEndLabel: '13:00',
  doctorNames: ['김민수', '박서연', '이정우'],
  firstDoctorId: 'd-kim',
}

test('[SCHED-HOURS-17][SCHED-HOURS-17e] 운영시간을 줄여 어긋나도 막지 않고 팝업도 안 띄운다 — 표 아래 상시 한 줄', async () => {
  const user = userEvent.setup()
  renderHours({ mismatch: MISMATCH })
  await user.clear(timeInput('토', '종료'))
  await user.type(timeInput('토', '종료'), '1300')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('mismatch-note')).toBeVisible()
})

test('[SCHED-HOURS-17g][SCHED-HOURS-17i] 문구는 결과를 적고, 여러 명은 한 줄에 묶는다', () => {
  renderHours({ mismatch: MISMATCH })
  const note = screen.getByTestId('mismatch-note')
  expect(note).toHaveTextContent('토요일 18:00까지 진료하는 의사가 3명 있습니다 — 상담봇은 13:00 이후 「진료시간이 아닙니다」라고 답합니다.')
  expect(note).toHaveTextContent('김민수 · 박서연 · 이정우')
})

test('[SCHED-HOURS-17h] 줄 끝의 갈 길을 누르면 그 의사가 골라진 채 열린다', async () => {
  const user = userEvent.setup()
  const { onGoToWeekly } = renderHours({ mismatch: MISMATCH })
  await user.click(screen.getByRole('button', { name: '의사별 스케줄에서 보기 ›' }))
  expect(onGoToWeekly).toHaveBeenCalledWith('d-kim')
})

test('[SCHED-HOURS-17j][SCHED-HOURS-17k] 어긋난 의사 0명이면 줄이 사라지고, 입력 중 값으로 실시간 계산하지 않는다', async () => {
  const user = userEvent.setup()
  const { utils } = renderHours({ mismatch: MISMATCH })
  await user.type(timeInput('토', '종료'), '1')
  expect(screen.getByTestId('mismatch-note')).toHaveTextContent('3명') // 저장된 값 기준 그대로
  utils.rerender(
    <HospitalHoursTable hours={week()} mismatch={null} onSave={vi.fn(async () => ({}))} onRefetch={vi.fn()} onGoToWeekly={vi.fn()} />,
  )
  expect(screen.queryByTestId('mismatch-note')).toBeNull()
})

test('[SCHED-HOURS-18] 옛 특정 날짜 휴무를 여기에 되살리지 않는다', () => {
  renderHours()
  expect(screen.queryByText(/특정 날짜|휴무일 추가/)).toBeNull()
})
