import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatusBadge } from './StatusBadge'

test('상태 글자를 함께 보인다 — 색만으로 뜻을 나르지 않는다', () => {
  render(<StatusBadge status="예약확정" />)
  expect(screen.getByText('예약확정')).toBeVisible()
})

test('알려진 상태는 기본 톤으로 물든다(예약신청=amber)', () => {
  render(<StatusBadge status="예약신청" />)
  expect(screen.getByText('예약신청').className).toContain('bg-amber-500')
})

test('tone prop으로 색을 덮어쓴다', () => {
  render(<StatusBadge status="예약확정" tone="red" />)
  expect(screen.getByText('예약확정').className).toContain('bg-rose-600')
})

test('모르는 상태는 회색으로 떨어진다', () => {
  render(<StatusBadge status="알수없음" />)
  expect(screen.getByText('알수없음').className).toContain('bg-slate-500')
})
