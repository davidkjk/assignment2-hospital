import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MiniCalendar } from './MiniCalendar'

// 병원 오늘 2026-08-29, 예약 가능 마지막 날(horizon) 2026-10-24(8주 뒤).
const ANCHOR_AUG = new Date(2026, 7, 29)
const TODAY = '2026-08-29'
const HORIZON = '2026-10-24'

/** 정확한 ISO 날짜 칸(data-iso). 범위 뷰가 여러 달을 죽 펼쳐도 흔들리지 않는 셀렉터다. */
function dayByIso(container: HTMLElement, iso: string): HTMLButtonElement | null {
  return container.querySelector(`.cal-mini-day[data-iso="${iso}"]`)
}

test('[CAL-BOOK-13] 오늘 이전 날짜는 고를 수 없고, 오늘은 강조·활성이다', () => {
  const { container } = render(
    <MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={() => {}} today={TODAY} horizonDate={HORIZON} />,
  )
  const todayBtn = container.querySelector('.cal-mini-day.is-today') as HTMLButtonElement
  expect(todayBtn.getAttribute('data-iso')).toBe(TODAY)
  expect(todayBtn.textContent?.trim()).toBe('29')
  expect(todayBtn.disabled).toBe(false)
  // 오늘이 든 주의 과거 칸(8/28)은 범위 밖 → disabled.
  expect(dayByIso(container, '2026-08-28')!.disabled).toBe(true)
})

test('[L8] 예약 가능 범위(오늘~horizon) 전체를 한 번에 펼쳐 보인다 — 월 이동 없이 10월까지 닿는다', () => {
  const { container } = render(
    <MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={() => {}} today={TODAY} horizonDate={HORIZON} />,
  )
  // 종전엔 8월 격자만 보여 9·10월로 못 넘어갔다(L3). 이제 오늘부터 horizon까지 같은 화면에 있다.
  expect(dayByIso(container, TODAY)).not.toBeNull()
  expect(dayByIso(container, '2026-09-15')).not.toBeNull()
  expect(dayByIso(container, HORIZON)).not.toBeNull()
  // 달이 바뀌는 자리에 길잡이 「N월」이 붙는다.
  expect(container.textContent).toMatch(/9월/)
  expect(container.textContent).toMatch(/10월/)
})

test('[CAL-BOOK-13] 예약 가능 마지막 날(horizon)은 고를 수 있고 그 다음 날부터는 못 고른다', () => {
  const { container } = render(
    <MiniCalendar mode="day" anchorDate={ANCHOR_AUG} onPick={() => {}} today={TODAY} horizonDate={HORIZON} />,
  )
  expect(dayByIso(container, '2026-10-24')!.disabled).toBe(false) // horizon 당일
  expect(dayByIso(container, '2026-10-25')!.disabled).toBe(true) // 그 다음 날
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
