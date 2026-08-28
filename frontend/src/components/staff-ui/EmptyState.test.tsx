import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EmptyState } from './EmptyState'

test('제목과 안내(할 일)를 함께 보인다 — 막다른 길을 만들지 않는다', () => {
  render(<EmptyState title="예약이 없습니다" hint="상단의 [새 예약]으로 등록하세요" />)
  expect(screen.getByText('예약이 없습니다')).toBeVisible()
  expect(screen.getByText('상단의 [새 예약]으로 등록하세요')).toBeVisible()
})

test('아이콘을 주면 함께 그린다', () => {
  render(<EmptyState title="비었습니다" icon={<svg data-testid="i" />} />)
  expect(screen.getByTestId('i')).toBeInTheDocument()
})
