import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { PeriodSelect } from './PeriodSelect'

// PERIOD-BOX-01 — 프리셋은 7/30/90일·1년·전체 다섯. '직접 지정'은 고를 수 없다
// (DEMO-REVIEW-NOTES G절: 사용자가 '직접 지정'을 목록에서 빼고 '최근 1년'을 넣었다).
test('프리셋 다섯을 보이고 「직접 입력」은 목록에 없다', () => {
  render(<PeriodSelect value={{ preset: '최근 7일', from: '2026-08-21', to: '2026-08-27' }} onChange={() => {}} />)
  const select = screen.getByLabelText('조회 기간')
  const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
  expect(labels).toEqual(['최근 7일', '최근 30일', '최근 90일', '최근 1년', '전체'])
})

// PERIOD-BOX-02 — 날짜 칸이 늘 보인다(프리셋 뒤에 숨기지 않는다).
test('시작일·종료일 칸이 늘 보인다', () => {
  render(<PeriodSelect value={{ preset: '최근 7일', from: '2026-08-21', to: '2026-08-27' }} onChange={() => {}} />)
  expect(screen.getByLabelText('시작일')).toBeVisible()
  expect(screen.getByLabelText('종료일')).toBeVisible()
})

// PERIOD-BOX-03 — 프리셋을 고르면 그 기간의 날짜로 맞춰진다(오늘 기준으로 계산).
test('「최근 30일」을 고르면 오늘 기준 30일 전~오늘로 바뀐다', async () => {
  const onChange = vi.fn()
  render(
    <PeriodSelect
      value={{ preset: '최근 7일', from: '2026-08-21', to: '2026-08-27' }}
      onChange={onChange}
      today="2026-08-27"
    />,
  )
  await userEvent.selectOptions(screen.getByLabelText('조회 기간'), '최근 30일')
  expect(onChange).toHaveBeenCalledWith({ preset: '최근 30일', from: '2026-07-28', to: '2026-08-27' })
})

// PERIOD-BOX-04 — 날짜를 직접 고치면 프리셋 표시가 「직접 입력」으로 바뀐다.
test('종료일을 직접 고치면 프리셋이 「직접 입력」이 된다', () => {
  const onChange = vi.fn()
  render(
    <PeriodSelect
      value={{ preset: '최근 7일', from: '2026-08-21', to: '2026-08-27' }}
      onChange={onChange}
      today="2026-08-27"
    />,
  )
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-08-25' } })
  expect(onChange).toHaveBeenLastCalledWith({ preset: '직접 입력', from: '2026-08-21', to: '2026-08-25' })
})

test('「직접 입력」 상태일 때만 그 항목이 목록에 나타난다', () => {
  render(<PeriodSelect value={{ preset: '직접 입력', from: '2026-08-01', to: '2026-08-05' }} onChange={() => {}} />)
  const select = screen.getByLabelText('조회 기간') as HTMLSelectElement
  expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toContain('직접 입력')
  expect(select.value).toBe('직접 입력')
})
