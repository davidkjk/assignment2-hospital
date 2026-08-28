import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MiniCalendar } from './MiniCalendar'

// 병원 오늘 2026-08-29, 예약 가능 마지막 날(horizon) 2026-10-24(8주 뒤).
const ANCHOR_AUG = new Date(2026, 7, 29)
const TODAY = '2026-08-29'
const HORIZON = '2026-10-24'

function dayButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('.cal-mini-day')) as HTMLButtonElement[]
}
/** 이번 달(other-month 아님) 칸 중 그 숫자를 가진 첫 버튼. */
function thisMonthDay(container: HTMLElement, num: string): HTMLButtonElement {
  return dayButtons(container).filter(
    (b) => !b.classList.contains('is-other-month') && b.textContent?.trim() === num,
  )[0]
}

test('[CAL-BOOK-13] 오늘 이전 날짜는 고를 수 없고, 오늘은 강조·활성이다', () => {
  const { container } = render(
    <MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={() => {}} today={TODAY} horizonDate={HORIZON} />,
  )
  const todayBtn = container.querySelector('.cal-mini-day.is-today') as HTMLButtonElement
  expect(todayBtn.textContent?.trim()).toBe('29')
  expect(todayBtn.disabled).toBe(false)
  // 같은 달의 과거(8/20)는 범위 밖 → disabled.
  expect(thisMonthDay(container, '20').disabled).toBe(true)
})

test('[CAL-BOOK-13] 예약 가능 마지막 날(horizon)은 고를 수 있고 그 다음 날부터는 못 고른다', () => {
  // 10월 그리드에서 24일(=horizon)과 25일 경계를 본다. iso 비교라 그리드 요일 배치와 무관.
  const { container } = render(
    <MiniCalendar mode="day" anchorDate={new Date(2026, 9, 24)} onPick={() => {}} today={TODAY} horizonDate={HORIZON} />,
  )
  expect(thisMonthDay(container, '24').disabled).toBe(false)
  expect(thisMonthDay(container, '25').disabled).toBe(true)
})

test('[갭#47] 화면이 「8주」를 박지 않고 서버 horizon으로 범위를 적는다', () => {
  render(<MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={() => {}} today={TODAY} horizonDate={HORIZON} />)
  expect(screen.getByTestId('mini-range')).toHaveTextContent(/예약 8월.10월/)
})

test('[CAL-NAV-06][CAL-NAV-07] 잡는 단위를 글자로 적는다 — 일간·주간이 다르다', () => {
  const { rerender } = render(<MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={() => {}} />)
  expect(screen.getByTestId('mini-unit-note')).toHaveTextContent('누른 날로 이동합니다')
  rerender(<MiniCalendar mode="week" anchorDate={ANCHOR_AUG} onPick={() => {}} />)
  expect(screen.getByTestId('mini-unit-note')).toHaveTextContent('누른 날이 든 주로 이동합니다')
})

test('[CAL-NAV-06] 범위 안 날짜를 누르면 그 ISO로 콜백이 온다', async () => {
  const onPick = vi.fn()
  const user = userEvent.setup()
  const { container } = render(
    <MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={onPick} today={TODAY} horizonDate={HORIZON} />,
  )
  await user.click(container.querySelector('.cal-mini-day.is-today') as HTMLButtonElement)
  expect(onPick).toHaveBeenCalledWith('2026-08-29')
})
