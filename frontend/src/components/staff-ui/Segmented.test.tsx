import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Segmented } from './Segmented'

const options: { key: 'all' | 'wait'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'wait', label: '대기' },
]

test('선택지를 모두 보이고, 활성 항목만 강조한다', () => {
  render(<Segmented options={options} value="all" onChange={() => {}} />)
  expect(screen.getByRole('button', { name: /전체/ }).className).toContain('bg-card')
  expect(screen.getByRole('button', { name: /대기/ }).className).not.toContain('bg-card')
})

test('클릭하면 그 key로 onChange가 불린다', async () => {
  const onChange = vi.fn()
  render(<Segmented options={options} value="all" onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: /대기/ }))
  expect(onChange).toHaveBeenCalledWith('wait')
})

test('count가 주어지면 항목 옆에 숫자를 보인다', () => {
  render(<Segmented options={options} value="all" onChange={() => {}} count={(k) => (k === 'wait' ? 3 : undefined)} />)
  expect(screen.getByRole('button', { name: /대기/ })).toHaveTextContent('3')
})
