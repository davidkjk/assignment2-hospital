import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DoctorWeekTable, type WeekPreview } from './DoctorWeekTable'
import { useDirtyMap } from './useDirtyMap'
import type { WeekRow } from './types'

function mkRow(w: number, opts: { off?: boolean; noLunch?: boolean; start?: string } = {}): WeekRow {
  if (opts.off) {
    return { weekday: w, is_day_off: true, start: null, end: null, slot_minutes: null, lunch_start: null, lunch_end: null, max_daily: null, booking_deadline: null }
  }
  return {
    weekday: w,
    is_day_off: false,
    start: (opts.start ?? '09:00') + ':00',
    end: '18:00:00',
    slot_minutes: 15,
    lunch_start: opts.noLunch ? null : '12:00:00',
    lunch_end: opts.noLunch ? null : '13:00:00',
    max_daily: 40,
    booking_deadline: '17:00:00',
  }
}

// 기본 주간: 토요일(5) 점심 없음. 나머지 진료. (일요일 off 여부는 테스트별로 준다)
function week(offDays: number[] = [], mondayStart?: string): WeekRow[] {
  return Array.from({ length: 7 }, (_, w) =>
    mkRow(w, { off: offDays.includes(w), noLunch: w === 5, start: w === 0 ? mondayStart : undefined }),
  )
}

function mkDoctors(n: number) {
  const names = ['박지훈', '최민석', '한소연', '김민수', '박서연', '이정우', '정하나', '오세훈']
  const depts = ['내과', '정형외과', '가정의학과', '내과', '이비인후과', '내과', '정형외과', '내과']
  return Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, name: names[i], department: depts[i] }))
}

const NO_PREVIEW: WeekPreview = { affected: [], slotRemoved: 0, slotAdded: 0 }

function renderTable(config: {
  doctors?: { id: string; name: string; department: string | null }[]
  serverWeek?: Record<string, WeekRow[]>
  onPreview?: (d: string, r: WeekRow[]) => Promise<WeekPreview>
  onCommit?: (d: string, r: WeekRow[]) => Promise<{ affected: number }>
}) {
  const doctors = config.doctors ?? mkDoctors(3)
  const serverWeek = config.serverWeek ?? Object.fromEntries(doctors.map((d) => [d.id, week([6])]))
  const onPreview = config.onPreview ?? vi.fn(async () => NO_PREVIEW)
  const onCommit = config.onCommit ?? vi.fn(async () => ({ affected: 0 }))

  function Harness() {
    const dirty = useDirtyMap()
    const [sel, setSel] = useState(doctors[0].id)
    return (
      <DoctorWeekTable
        doctors={doctors}
        selectedDoctorId={sel}
        onSelectDoctor={setSel}
        serverWeek={serverWeek}
        dirty={dirty}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    )
  }
  render(<Harness />)
  return { onPreview, onCommit }
}

// ── helpers ──
const rowLabels = () => Array.from(document.querySelectorAll('[data-row]')).map((el) => el.getAttribute('data-row'))
const rowOf = (label: string) => document.querySelector(`[data-row="${label}"]`) as HTMLElement
const cellsOf = () => Array.from(document.querySelectorAll('thead th')).slice(1).map((el) => el.textContent)
const dayToggle = (label: string) => within(rowOf(label)).getByRole('switch')
const inputsOf = (label: string) => within(rowOf(label)).queryAllByRole('textbox') as HTMLInputElement[]
const timeInput = (day: string, which: '시작' | '종료') => screen.getByLabelText(`${day} 진료 ${which}`) as HTMLInputElement
const cell = (day: string, col: string) => document.querySelector(`[data-cell2="${day}|${col}"]`) as HTMLElement
const doctorChips = () => screen.getAllByRole('tab')
const doctorChip = (name: string) => document.querySelector(`[data-chip="${name}"]`) as HTMLElement
const saveButtons = () => screen.getAllByRole('button', { name: '저장' })
const dialogButtons = () => within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.textContent)

async function editCell(user: ReturnType<typeof userEvent.setup>, day: string, col: string, value: string) {
  const input = cell(day, col) as HTMLInputElement
  await user.clear(input)
  await user.type(input, value)
}

test('[SCHED-WEEK-01][SCHED-WEEK-08][SCHED-WEEK-09] 의사는 위쪽 가로줄, 활성 의사만, 8명이어도 전부 늘어놓는다', () => {
  renderTable({ doctors: mkDoctors(8) }) // 부모가 활성만 넘긴다 — 접거나 검색칸을 두지 않는다
  expect(doctorChips()).toHaveLength(8)
  expect(doctorChip('박지훈')).toHaveTextContent('내과')
})

test('[SCHED-WEEK-02] 7행이 늘 다 보인다 — 접거나 감추지 않는다', () => {
  renderTable({})
  expect(rowLabels()).toEqual(['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'])
})

test('[SCHED-WEEK-03] 한 행에 여섯 칸 — 진료 스위치·시간·칸 길이·점심·최대 인원·예약 마감', () => {
  renderTable({})
  expect(cellsOf()).toEqual(['진료', '진료 시간', '한 칸 길이', '점심시간', '하루 최대 인원', '예약 마감'])
})

test('[SCHED-WEEK-04] 휴진 스위치를 끄면 그 줄의 나머지 칸이 전부 잠긴다', async () => {
  const user = userEvent.setup()
  renderTable({ serverWeek: undefined }) // 일요일만 off, 나머지 진료
  // 월요일(진료중)을 끄면 잠긴다
  await user.click(dayToggle('월요일'))
  expect(inputsOf('월요일')).toHaveLength(0) // 입력칸이 사라져 전부 잠긴다
  expect(rowOf('월요일')).toHaveTextContent('—')
})

test('[SCHED-WEEK-05] 시각은 숫자로 친다 — 드롭다운을 두지 않는다', async () => {
  const user = userEvent.setup()
  renderTable({})
  await user.clear(timeInput('월요일', '시작'))
  await user.type(timeInput('월요일', '시작'), '0900')
  expect(timeInput('월요일', '시작')).toHaveValue('09:00')
  expect(screen.queryByRole('combobox')).toBeNull()
})

test('[SCHED-WEEK-06] 점심이 없는 요일은 「0분」이 아니라 「—」다', () => {
  renderTable({})
  expect(cell('토요일', '점심시간')).toHaveTextContent('—')
})

test('[SCHED-WEEK-07] [월요일 값을 나머지에]는 휴진으로 꺼둔 줄을 건드리지 않는다', async () => {
  const user = userEvent.setup()
  // 월요일 08:00 시작, 일요일 휴진
  renderTable({ serverWeek: { d1: week([6], '08:00'), d2: week([6]), d3: week([6]) } })
  await user.click(screen.getByRole('button', { name: '월요일 값을 나머지에' }))
  expect(timeInput('화요일', '시작')).toHaveValue('08:00') // 월요일 값이 복사됨
  expect(rowOf('일요일')).toHaveTextContent('—') // 휴진은 그대로
})

test('[SCHED-SAVE-01][SCHED-SAVE-02] 저장 버튼은 하나뿐이고, 고친 줄에 ● + 「고친 곳 2군데 · 아직 저장 안 됨」', async () => {
  const user = userEvent.setup()
  renderTable({})
  await editCell(user, '월요일', '하루 최대 인원', '50')
  await editCell(user, '수요일', '한 칸 길이', '20')
  expect(saveButtons()).toHaveLength(1)
  expect(screen.getByText('고친 곳 2군데 · 아직 저장 안 됨')).toBeVisible()
  expect(rowOf('월요일')).toHaveTextContent('●')
})

test('[SCHED-SAVE-02b][갭 #106] 다른 의사로 옮겨도 그 의사 이름 옆에 ●가 남고 값이 덮이지 않는다', async () => {
  const user = userEvent.setup()
  renderTable({ doctors: mkDoctors(5) }) // 박서연=d5, 김민수=d4
  await user.click(doctorChip('박서연'))
  await editCell(user, '월요일', '하루 최대 인원', '50')
  await user.click(doctorChip('김민수'))
  expect(doctorChip('박서연')).toHaveTextContent('●')
  await user.click(doctorChip('박서연'))
  expect(cell('월요일', '하루 최대 인원')).toHaveValue('50') // 덮이지 않았다
})

test('[SCHED-SAVE-06] 같은 화면 안에서 의사를 옮겼다 돌아와도 고친 값과 ●가 남는다', async () => {
  const user = userEvent.setup()
  renderTable({ doctors: mkDoctors(5) })
  await user.click(doctorChip('박서연'))
  await editCell(user, '화요일', '하루 최대 인원', '33')
  await user.click(doctorChip('김민수'))
  await user.click(doctorChip('박서연'))
  expect(cell('화요일', '하루 최대 인원')).toHaveValue('33')
  expect(rowOf('화요일')).toHaveTextContent('●')
})

test('[SCHED-SAVE-03][갭 #95] 저장은 고친 줄 전부가 한 덩어리 — 한 번만 부른다', async () => {
  const user = userEvent.setup()
  const onCommit = vi.fn(async (_d: string, _r: WeekRow[]) => ({ affected: 0 }))
  renderTable({ onCommit })
  await editCell(user, '월요일', '하루 최대 인원', '50')
  await editCell(user, '수요일', '한 칸 길이', '20')
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit.mock.calls[0][1]).toHaveLength(2) // 줄마다 부르지 않는다
})

test('[SCHED-SAVE-04][SCHED-SAVE-05] 경고 팝업은 한 번만 뜨고, 어느 요일 때문인지가 들어 있다', async () => {
  const user = userEvent.setup()
  const onPreview = vi.fn(async () => ({ affected: [{ weekday: 2, count: 2 }, { weekday: 5, count: 1 }], slotRemoved: 0, slotAdded: 0 }))
  renderTable({ onPreview })
  await user.click(dayToggle('수요일'))
  await user.click(dayToggle('토요일'))
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByRole('dialog')).toHaveTextContent(/수요일 2건/)
  expect(screen.getByRole('dialog')).toHaveTextContent(/토요일 1건/)
})

test('[SCHED-WARN-08] 경고 팝업의 버튼은 둘뿐이다', async () => {
  const user = userEvent.setup()
  const onPreview = vi.fn(async () => ({ affected: [{ weekday: 2, count: 2 }], slotRemoved: 0, slotAdded: 0 }))
  renderTable({ onPreview })
  await user.click(dayToggle('수요일')) // 휴진으로 끔 → 영향
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(dialogButtons()).toEqual(['그만두기', '그래도 휴진 저장'])
})

test('[SCHED-SAVE-08][SCHED-WARN-09][SCHED-WARN-10] 저장 성공하면 ●가 사라지고 넘어간 건수를 말해 준다', async () => {
  const user = userEvent.setup()
  const onPreview = vi.fn(async () => ({ affected: [{ weekday: 0, count: 3 }], slotRemoved: 0, slotAdded: 0 }))
  const onCommit = vi.fn(async () => ({ affected: 3 }))
  renderTable({ onPreview, onCommit })
  await editCell(user, '월요일', '하루 최대 인원', '50')
  await user.click(screen.getByRole('button', { name: '저장' }))
  await user.click(screen.getByRole('button', { name: '그래도 저장' }))
  expect(screen.queryByText('●')).toBeNull()
  expect(screen.getByTestId('handoff-target')).toHaveTextContent('/today 확인 필요한 예약')
  expect(screen.getByRole('status')).toHaveTextContent('3건은 접수 직원의 「확인 필요한 예약」으로 넘어갔습니다.')
})

test('[SCHED-SLOT-07] 저장 전에 「자리 12개가 없어지고 20개가 생깁니다」를 보여준다', async () => {
  const user = userEvent.setup()
  const onPreview = vi.fn(async () => ({ affected: [], slotRemoved: 12, slotAdded: 20 }))
  renderTable({ onPreview })
  await editCell(user, '월요일', '한 칸 길이', '30')
  await user.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('자리 12개가 없어지고 20개가 생깁니다')
})
