import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Panel } from './Panel'

test('제목과 본문을 함께 보인다', () => {
  render(<Panel title="환자 목록">행 1</Panel>)
  expect(screen.getByRole('heading', { name: '환자 목록' })).toBeVisible()
  expect(screen.getByText('행 1')).toBeVisible()
})

test('제목이 있으면 우측 action도 그린다', () => {
  render(<Panel title="목록" action={<button>더보기</button>}>본문</Panel>)
  expect(screen.getByRole('button', { name: '더보기' })).toBeVisible()
})

test('각지고 촘촘한 데이터 패널 — 얇은 경계·미세 그림자·rounded-xl', () => {
  render(<Panel title="t">x</Panel>)
  const section = screen.getByRole('heading', { name: 't' }).closest('section')!
  expect(section.className).toContain('rounded-xl')
  expect(section.className).toContain('border-border')
  expect(section.className).toContain('shadow-xs')
})
