import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { UndoControl } from './UndoControl'

test('[UNDO-CONF-01][UNDO-BTN-02] 되돌리기에는 확인창을 두지 않고 빨간 버튼도 쓰지 않는다', async () => {
  const user = userEvent.setup()
  const onUndo = vi.fn()
  // BLOCK-CONF-01(빨간 버튼은 확인창 안에서만)은 되돌릴 수 없는 동작의 규칙이라 여기 걸리지 않는다.
  // 되돌리기는 「고치는 동작」이지 위험한 동작이 아니다.
  render(<UndoControl onUndo={onUndo} />)
  const btn = screen.getByRole('button', { name: '되돌리기' })
  await user.click(btn)
  expect(screen.queryByRole('dialog')).toBeNull() // 확인창 없음
  expect(onUndo).toHaveBeenCalledTimes(1)
  expect(btn).toHaveClass('btn', 'q') // 조용한 버튼
  expect(btn).not.toHaveClass('danger')
})

test('[UNDO-WHY-02] 사유가 필요한 경우에만 사유 팝업을 띄운다 — 판단은 서버가 준 값을 따른다', async () => {
  const user = userEvent.setup()
  const onUndo = vi.fn()
  render(<UndoControl onUndo={onUndo} requiresReason />)
  await user.click(screen.getByRole('button', { name: '되돌리기' }))
  // 사유 팝업(확인창이 아니라 사유 수집)이 뜨고, 아직 되돌리지 않았다.
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(onUndo).not.toHaveBeenCalled()
  await user.type(screen.getByRole('textbox'), '기록 수정 요청')
  await user.click(screen.getByRole('button', { name: '확인' }))
  expect(onUndo).toHaveBeenCalledWith('기록 수정 요청')
})
