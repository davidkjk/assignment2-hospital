import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SearchInput } from './SearchInput'

test('placeholder를 보이고 입력 값을 표시한다', () => {
  render(<SearchInput value="김" onChange={() => {}} placeholder="이름 검색" />)
  const input = screen.getByPlaceholderText('이름 검색') as HTMLInputElement
  expect(input.value).toBe('김')
})

test('타이핑하면 바뀐 문자로 onChange가 불린다', async () => {
  const onChange = vi.fn()
  render(<SearchInput value="" onChange={onChange} placeholder="검색" />)
  await userEvent.type(screen.getByPlaceholderText('검색'), 'a')
  expect(onChange).toHaveBeenCalledWith('a')
})

test('아이콘을 주면 입력칸 왼쪽 여백을 넓힌다(pl-9)', () => {
  render(<SearchInput value="" onChange={() => {}} placeholder="검색" icon={<svg data-testid="i" />} />)
  expect(screen.getByTestId('i')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('검색').className).toContain('pl-9')
})
