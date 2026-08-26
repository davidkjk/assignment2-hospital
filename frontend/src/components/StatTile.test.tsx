import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatTile } from './StatTile'

test('[STAT-01] 큰 숫자와 그 밑의 이름표를 함께 보인다', () => {
  render(<StatTile value={12} label="오늘 진료" />)
  const tile = screen.getByRole('group', { name: '오늘 진료' })
  expect(tile).toHaveTextContent('12')
  expect(tile).toHaveTextContent('오늘 진료')
})

test('[DISP-COLOR-01] 색만으로 뜻을 나르지 않는다 — 톤을 줘도 글자(이름표)가 함께 있다', () => {
  render(<StatTile value={3} label="부도" tone="warn" />)
  expect(screen.getByText('부도')).toBeVisible()
})
