import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { CalendarNav, formatRange, shiftAnchor } from './CalendarNav'

const AUG5 = new Date(2026, 7, 5) // 수요일 — 그 주는 월(3)~토(8)
const AUG17 = new Date(2026, 7, 17)

test('[CAL-NAV-03] 일간 라벨은 그 하루다', () => {
  expect(formatRange('day', AUG17)).toBe('2026년 8월 17일')
})

test('[CAL-NAV-03] 주간 라벨은 그 주의 월~토(6일)다', () => {
  expect(formatRange('week', AUG5)).toBe('2026년 8월 3일 – 8일')
})

test('[CAL-NAV-03] 화살표는 보는 단위만큼 움직인다 — 주간은 한 주', () => {
  const next = shiftAnchor('week', AUG5, 1)
  expect(formatRange('week', next)).toBe('2026년 8월 10일 – 15일')
})

test('[CAL-NAV-03] 일간 화살표는 하루씩 움직인다', () => {
  const next = shiftAnchor('day', AUG17, 1)
  expect(formatRange('day', next)).toBe('2026년 8월 18일')
})

function setup() {
  const props = {
    mode: 'week' as const,
    anchorDate: AUG5,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onOpenCalendar: vi.fn(),
  }
  render(<CalendarNav {...props} />)
  return props
}

test('[CAL-NAV-04] 기간 글자 자체가 버튼이고 별도 [달력] 아이콘을 두지 않는다', () => {
  setup()
  expect(screen.getByRole('button', { name: /2026년 8월 3일 – 8일/ })).toBeVisible()
  expect(screen.queryByLabelText('달력 열기')).toBeNull()
})

test('[CAL-NAV-03] 다음 화살표가 onNext를 부른다', async () => {
  const user = userEvent.setup()
  const props = setup()
  await user.click(screen.getByLabelText('다음'))
  expect(props.onNext).toHaveBeenCalled()
})

test('[CAL-NAV-08] [오늘]이 onToday를 부른다', async () => {
  const user = userEvent.setup()
  const props = setup()
  await user.click(screen.getByRole('button', { name: '오늘' }))
  expect(props.onToday).toHaveBeenCalled()
})
