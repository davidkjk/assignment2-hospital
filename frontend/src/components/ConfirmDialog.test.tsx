import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'
import { IdentityConfirmDialog } from './IdentityConfirmDialog'
import { ReasonPromptDialog } from './ReasonPromptDialog'

// ── ConfirmDialog: 멈춰 세우는 가운데 팝업 ──────────────────────────────

test('[PANEL-USE-02][PANEL-USE-03] 확인 팝업은 바깥을 눌러도 닫히지 않는다', async () => {
  const user = userEvent.setup()
  const onCancel = vi.fn()
  render(<ConfirmDialog title="등록할까요?" onConfirm={vi.fn()} onCancel={onCancel} />)
  // 뒤(바깥)를 눌러도 「멈춰 세우기」가 풀리면 안 된다.
  await user.click(document.body)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(onCancel).not.toHaveBeenCalled()
})

test('[PANEL-USE-01] 확인 팝업은 패널이 아니라 가운데에 뜬다', () => {
  render(<ConfirmDialog title="등록할까요?" onConfirm={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByRole('dialog')).not.toHaveClass('side-panel')
})

test('[BLOCK-CONF-01] 되돌릴 수 없는 동작의 빨간 버튼은 확인창 안에서만 쓴다', () => {
  render(<ConfirmDialog title="정말 삭제할까요?" danger confirmLabel="삭제" onConfirm={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByRole('button', { name: '삭제' })).toHaveStyle({ background: 'var(--color-danger)' })
})

test('[PANEL-USE-02] [확인]·[취소]만 팝업을 움직인다', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  render(<ConfirmDialog title="등록할까요?" confirmLabel="등록" onConfirm={onConfirm} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: '등록' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

// ── IdentityConfirmDialog: 저장 직전 한 번, 신원을 눈으로 ────────────────

test('[QUEUE-SAME-01][SEARCH-ACT-07] 저장 직전 재확인은 이름·생년월일·전화를 함께 보인다', () => {
  render(
    <IdentityConfirmDialog
      patient={{ name: '김순자', birthDate: '1958-03-12', phone: '010-1234-5678' }}
      confirmLabel="등록"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent('김순자')
  expect(dialog).toHaveTextContent('1958-03-12')
  expect(dialog).toHaveTextContent('010-1234-5678')
  expect(dialog).not.toHaveClass('side-panel') // 패널이 아니라 가운데 팝업
})

// ── ReasonPromptDialog: 사유 한 줄(되돌리기용) ─────────────────────────

test('[UNDO-WHY-01] 사유를 비운 채로는 확인을 누를 수 없다', () => {
  render(<ReasonPromptDialog title="되돌리기 사유" onSubmit={vi.fn()} onCancel={vi.fn()} />)
  expect(screen.getByRole('button', { name: '확인' })).toBeDisabled()
})

test('[UNDO-WHY-01] 사유를 적으면 그 글자와 함께 확인이 열린다', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<ReasonPromptDialog title="되돌리기 사유" onSubmit={onSubmit} onCancel={vi.fn()} />)
  await user.type(screen.getByRole('textbox'), '기록 수정 요청')
  await user.click(screen.getByRole('button', { name: '확인' }))
  expect(onSubmit).toHaveBeenCalledWith('기록 수정 요청')
})
