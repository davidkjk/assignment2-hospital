import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { TextField, NumberField, Checkbox, Select, TextArea } from './fields'

test('TextField는 진짜 text 인풋을 aria-label로 노출하고 입력을 흘린다', async () => {
  const onChange = vi.fn()
  render(<TextField value="" onChange={onChange} ariaLabel="주소" />)
  await userEvent.type(screen.getByLabelText('주소'), '서울')
  expect(onChange).toHaveBeenCalled()
})

test('NumberField는 spinbutton으로, 단위 suffix를 함께 그린다', async () => {
  const onChange = vi.fn()
  render(<NumberField value={24} onChange={onChange} ariaLabel="취소 마감" suffix="시간 전까지" />)
  expect(screen.getByRole('spinbutton', { name: '취소 마감' })).toBeVisible()
  expect(screen.getByText('시간 전까지')).toBeVisible()
})

test('Checkbox는 role=checkbox·aria-label을 유지하고 토글한다', async () => {
  const onChange = vi.fn()
  render(<Checkbox checked={false} onChange={onChange} ariaLabel="문자도 발송" label="문자도 발송" />)
  const box = screen.getByRole('checkbox', { name: '문자도 발송' })
  expect(box).not.toBeChecked()
  await userEvent.click(box)
  expect(onChange).toHaveBeenCalledWith(true)
})

test('Checkbox disabled는 클릭돼도 값이 바뀌지 않는다', async () => {
  const onChange = vi.fn()
  render(<Checkbox checked={false} onChange={onChange} disabled ariaLabel="잠김" />)
  await userEvent.click(screen.getByRole('checkbox', { name: '잠김' }))
  expect(onChange).not.toHaveBeenCalled()
})

test('Select는 combobox로 남고 선택을 흘린다', async () => {
  const onChange = vi.fn()
  render(
    <Select value="a" onChange={onChange} ariaLabel="누구에게">
      <option value="a">가</option>
      <option value="b">나</option>
    </Select>,
  )
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '누구에게' }), 'b')
  expect(onChange).toHaveBeenCalledWith('b')
})

test('TextArea는 textbox로 남고 입력을 흘린다', async () => {
  const onChange = vi.fn()
  render(<TextArea value="" onChange={onChange} ariaLabel="문구" />)
  await userEvent.type(screen.getByRole('textbox', { name: '문구' }), '안내')
  expect(onChange).toHaveBeenCalled()
})
