import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatTile } from './StatTile'

test('큰 숫자와 이름표를 함께 보인다', () => {
  render(<StatTile label="오늘 예약" value={42} />)
  expect(screen.getByText('오늘 예약')).toBeVisible()
  expect(screen.getByText('42')).toBeVisible()
})

test('tone을 줘도 이름표 글자가 함께 있다 — 색만으로 뜻을 나르지 않는다', () => {
  render(<StatTile label="부도" value={3} tone="amber" hint="어제 대비 +1" />)
  expect(screen.getByText('부도')).toBeVisible()
  expect(screen.getByText('어제 대비 +1')).toBeVisible()
  expect(screen.getByText('3').className).toContain('text-amber-600')
})
