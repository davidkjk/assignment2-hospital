import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TextButton } from './TextButton'

test('링크형(기본)은 딥틸 글자로 보인다', () => {
  render(<TextButton>더 보기</TextButton>)
  const btn = screen.getByRole('button', { name: '더 보기' })
  expect(btn.style.color).toBe('var(--color-primary)')
  expect(btn.className).toContain('staff-text-btn')
})

test('quiet 톤은 되돌리기 어려운 동작을 옅은 회색으로 눈에 덜 띄게', () => {
  render(<TextButton tone="quiet">사진 지우기</TextButton>)
  expect(screen.getByRole('button', { name: '사진 지우기' }).style.color).toBe('var(--color-ink-muted)')
})

test('기본 type은 button이라 폼을 제출하지 않는다', () => {
  render(<TextButton>취소</TextButton>)
  expect(screen.getByRole('button', { name: '취소' }).getAttribute('type')).toBe('button')
})

test('onClick과 aria-label이 전달된다', () => {
  const onClick = vi.fn()
  render(<TextButton aria-label="필터 지우기" onClick={onClick} />)
  screen.getByRole('button', { name: '필터 지우기' }).click()
  expect(onClick).toHaveBeenCalledOnce()
})
