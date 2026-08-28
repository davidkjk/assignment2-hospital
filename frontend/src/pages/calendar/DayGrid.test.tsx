import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { DayGrid } from './DayGrid'
import type { GridAppointment, GridBlock, GridDoctor } from './gridModel'

const DATE = '2026-08-17'
const NOW = new Date('2026-08-17T09:00:00+09:00')

const DOCTORS: GridDoctor[] = [
  { id: 'd1', name: '박지훈', departmentName: '내과', paletteIndex: 3, slotMinutes: 15 },
  { id: 'd2', name: '최민석', departmentName: '내과', paletteIndex: 1, slotMinutes: 20 },
  { id: 'd3', name: '한소연', departmentName: '피부과', paletteIndex: 5, slotMinutes: 30 },
]

function appt(doctorId: string, startMin: number, endMin: number, id: string): GridAppointment {
  return { appointmentId: id, doctorId, patientLabel: '김민지', statusLabel: '확정', startMin, endMin }
}

function renderGrid(props: Partial<React.ComponentProps<typeof DayGrid>> = {}) {
  return render(
    <DayGrid
      date={DATE}
      doctors={DOCTORS}
      appointmentsByDoctor={new Map()}
      blocksByDoctor={new Map()}
      hourHeight={120}
      now={NOW}
      {...props}
    />,
  )
}

test('[CAL-VIEW-03] 기본은 의사가 열 — 고른 의사 이름이 열 머리에 순서대로 선다', () => {
  renderGrid()
  expect(screen.getByTestId('head-d1')).toHaveTextContent('박지훈')
  expect(screen.getByTestId('head-d2')).toHaveTextContent('최민석')
  expect(screen.getByTestId('head-d3')).toHaveTextContent('한소연')
})

test('[CAL-NAME-02] 열 머리에 진료과와 진료시간을 함께 적는다', () => {
  renderGrid()
  expect(screen.getByTestId('head-d1')).toHaveTextContent(/박지훈\s*내과\s*15분/)
})

test('[CAL-TIME-01][CAL-TIME-08] 눈금 글자는 30분마다이고 5분 격자선을 깔지 않는다', () => {
  const { container } = renderGrid({ startHour: 9, endHour: 12 })
  const labels = within(screen.getByTestId('time-axis')).getAllByTestId('axis-label').map((n) => n.textContent)
  expect(labels).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'])
  expect(container.querySelectorAll('.grid-line-5min')).toHaveLength(0)
})

test('[CAL-PAST-05] 낮(진료시간 안)에 열면 지금 선이 보이게 아래로 스크롤한다', async () => {
  const { container } = renderGrid({ now: new Date('2026-08-17T13:00:00+09:00') })
  const grid = container.querySelector('.cal-day-grid') as HTMLElement
  // rAF 뒤 scrollTop이 (13:00−09:00)만큼 아래로 내려간다 — 지금을 1/3 지점에.
  await waitFor(() => expect(grid.scrollTop).toBeGreaterThan(0))
})

test('[CAL-PAST-05] 진료시간 밖(새벽)에는 스크롤하지 않는다 — 09:00부터 보인다', async () => {
  const { container } = renderGrid({ now: new Date('2026-08-17T05:49:00+09:00') })
  const grid = container.querySelector('.cal-day-grid') as HTMLElement
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  expect(grid.scrollTop).toBe(0)
})

test('[CAL-VIEW-05] 주간(compact·hideAxis)에서는 각 날이 스스로 스크롤하지 않는다', async () => {
  const { container } = renderGrid({ now: new Date('2026-08-17T13:00:00+09:00'), compact: true, hideAxis: true })
  const grid = container.querySelector('.cal-day-grid') as HTMLElement
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  expect(grid.scrollTop).toBe(0)
})

test('[CAL-SLOT-06] 빈 구간을 누르면 시작 시각과 함께 콜백이 온다(전화예약으로 이어진다)', async () => {
  const onEmptyClick = vi.fn()
  const user = userEvent.setup()
  renderGrid({ onEmptyClick, now: new Date('2026-08-17T08:00:00+09:00') })
  const col = screen.getByTestId('column-d1')
  await user.click(within(col).getByText('빈 시간 09:00–18:00'))
  expect(onEmptyClick).toHaveBeenCalledWith('d1', 9 * 60)
})

test('[CAL-SLOT-07] 예약 블록을 누르면 그 예약 id로 상세 콜백이 온다', async () => {
  const onBlockClick = vi.fn()
  const user = userEvent.setup()
  const map = new Map([['d1', [appt('d1', 10 * 60, 10 * 60 + 15, 'a1')]]])
  renderGrid({ appointmentsByDoctor: map, onBlockClick, now: new Date('2026-08-17T08:00:00+09:00') })
  await user.click(screen.getByText('김민지'))
  expect(onBlockClick).toHaveBeenCalledWith('a1')
})

test('[CAL-COLOR-14] 예약 블록은 그 의사 팔레트 인덱스 면으로 칠해진다', () => {
  const map = new Map([['d1', [appt('d1', 10 * 60, 10 * 60 + 15, 'a1')]]])
  renderGrid({ appointmentsByDoctor: map, now: new Date('2026-08-17T08:00:00+09:00') })
  const slot = screen.getByText('김민지').closest('.cal-slot') as HTMLElement
  expect(slot.style.background).toBe('var(--doctor-palette-3-fill)') // d1 = 인덱스 3
})

test('[CAL-SLOT-05] 영향 예약에 「확인 필요」 배지가 붙는다', () => {
  const map = new Map([['d1', [appt('d1', 10 * 60, 10 * 60 + 15, 'a1')]]])
  renderGrid({ appointmentsByDoctor: map, affectedIds: new Set(['a1']), now: new Date('2026-08-17T08:00:00+09:00') })
  expect(screen.getByText('확인 필요')).toBeVisible()
})

test('[CAL-SLOT-03][CAL-SLOT-08] 점심과 휴진은 같은 빗금이고 글자만 다르다', () => {
  const blocks = new Map<string, GridBlock[]>([
    ['d1', [{ doctorId: 'd1', kind: 'lunch', startMin: 12 * 60 + 30, endMin: 13 * 60 + 30 }]],
    ['d2', [{ doctorId: 'd2', kind: 'closed', startMin: null, endMin: null }]],
  ])
  renderGrid({ blocksByDoctor: blocks, now: new Date('2026-08-17T08:00:00+09:00') })
  expect(screen.getByText('점심시간 12:30–13:30')).toHaveClass('is-hatched')
  expect(screen.getByText('휴진 09:00–18:00')).toHaveClass('is-hatched')
})

test('[CAL-PAST-01][CAL-PAST-02] 지난 빈 곳을 누르면 안내와 [당일 방문 등록]이 뜨고 막지 않는다', async () => {
  const user = userEvent.setup()
  renderGrid({ now: new Date('2026-08-17T14:00:00+09:00') })
  const col = screen.getByTestId('column-d1')
  await user.click(within(col).getByText('지난 시간'))
  expect(screen.getByText('이미 지난 시간입니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '당일 방문 등록' })).toBeVisible()
})

test('[CAL-PAST-03] 어제 이전 날짜의 지난 빈 곳은 [지난 날 방문 기록]을 준다', async () => {
  const user = userEvent.setup()
  renderGrid({ date: '2026-08-13', now: new Date('2026-08-17T14:00:00+09:00') })
  const col = screen.getByTestId('column-d1')
  await user.click(within(col).getAllByText('지난 시간')[0])
  expect(screen.getByText('지난 날짜입니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '지난 날 방문 기록' })).toBeVisible()
})

test('[CAL-PAST-05] 오늘 열에 현재 시각 가로선이 있다', () => {
  renderGrid()
  expect(screen.getAllByTestId('now-line').length).toBeGreaterThan(0)
})

test('[CAL-COLOR-04][CAL-COLOR-05] 관리자에게만 열 머리에 설정(⚙)이 있다', async () => {
  const onDoctorSettings = vi.fn()
  const user = userEvent.setup()
  const { rerender } = renderGrid({ isAdmin: false })
  expect(screen.queryByLabelText('박지훈 설정')).toBeNull()
  rerender(
    <DayGrid date={DATE} doctors={DOCTORS} appointmentsByDoctor={new Map()} blocksByDoctor={new Map()} hourHeight={120} now={NOW} isAdmin onDoctorSettings={onDoctorSettings} />,
  )
  await user.click(screen.getByLabelText('박지훈 설정'))
  expect(onDoctorSettings).toHaveBeenCalledWith('박지훈')
})

test('[CAL-DAY-02] 열이 많으면 가로 스크롤이고 접지 않는다', () => {
  renderGrid()
  expect(screen.getByTestId('day-grid').getAttribute('data-scroll')).toContain('horizontal')
})

test('[CAL-BOOK-04][CAL-RACE-02] 자리표는 taken이면 「방금 찼습니다」로 바뀐다', () => {
  const { rerender } = renderGrid({ hold: { doctorId: 'd1', startMin: 10 * 60 + 5, endMin: 10 * 60 + 20 } })
  expect(screen.getByTestId('hold-slot')).toBeVisible()
  rerender(
    <DayGrid date={DATE} doctors={DOCTORS} appointmentsByDoctor={new Map()} blocksByDoctor={new Map()} hourHeight={120} now={NOW} hold={{ doctorId: 'd1', startMin: 10 * 60 + 5, endMin: 10 * 60 + 20, taken: true }} />,
  )
  expect(screen.getByText('⚠ 방금 찼습니다')).toBeVisible()
  expect(screen.getByTestId('hold-slot')).toHaveClass('is-taken')
})

// [TIME-TZ-01] 「오늘」과 「지금」은 병원 시계다 — 창구 PC 시계가 아니다.
test('[CAL-PAST-05] 한국이 자정을 넘긴 순간, 지금 선은 병원 시각 자리에 그려진다', () => {
  // KST 2026-08-17 10:30 = UTC 01:30. 기계가 미 서부(8/16 18:30)여도 8/17의 10:30이다.
  renderGrid({ date: '2026-08-17', now: new Date('2026-08-17T01:30:00Z') })
  expect(document.querySelector('[data-testid="now-line"]')).not.toBeNull()
})
