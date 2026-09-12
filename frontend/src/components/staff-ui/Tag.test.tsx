import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Tag } from './Tag'

test('내용을 옅은 칩으로 보인다', () => {
  render(<Tag>내과</Tag>)
  const tag = screen.getByText('내과')
  expect(tag).toBeVisible()
  expect(tag.className).toContain('bg-muted')
})

test('className을 덧붙일 수 있다', () => {
  render(<Tag className="ml-2">외과</Tag>)
  expect(screen.getByText('외과').className).toContain('ml-2')
})
