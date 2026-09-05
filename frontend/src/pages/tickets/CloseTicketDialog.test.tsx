import { it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CloseTicketButton } from './CloseTicketDialog'

it('[TICKET-DETAIL-CLOSE-01] 일반 보내기와 분리된 직원 전용 [상담 종료]를 제공한다', () => {
  render(<CloseTicketButton closing={false} hasUnsentDraft={false} onConfirmClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: '상담 종료' })).toBeInTheDocument()
})

it('[TICKET-DETAIL-CLOSE-SEP-01] 상담 종료를 보내기와 인접 배치하지 않도록 분리 컨테이너에 둔다', () => {
  const { container } = render(<CloseTicketButton closing={false} hasUnsentDraft={false} onConfirmClose={vi.fn()} />)
  expect(container.querySelector('[data-detached]')).toBeInTheDocument()
})

it('[TICKET-DETAIL-CLOSE-02] 종료는 확인창 안에서만 실행하고, 미전송 답변이 있으면 먼저 보낼까요 경고를 함께 표시한다', async () => {
  const onConfirmClose = vi.fn(async () => {})
  render(<CloseTicketButton closing={false} hasUnsentDraft={true} onConfirmClose={onConfirmClose} />)
  expect(onConfirmClose).not.toHaveBeenCalled() // 바로 종료 안 됨
  await userEvent.click(screen.getByRole('button', { name: '상담 종료' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('먼저 보낼까요?')
  await userEvent.click(within(dialog).getByRole('button', { name: '상담 종료' }))
  expect(onConfirmClose).toHaveBeenCalled() // 확인 후에만
})

it('[TICKET-DETAIL-CLOSE-03] 종료 처리 중에는 상담 종료 중복 실행을 막고 처리 중 상태를 표시한다', () => {
  render(<CloseTicketButton closing={true} hasUnsentDraft={false} onConfirmClose={vi.fn()} />)
  expect(screen.getByRole('button', { name: /상담 종료/ })).toBeDisabled()
})

it('[TICKET-DETAIL-CLOSE-04] 종료 실패면 종료 실패·재시도를 종료 동작 가까이에 표시한다', async () => {
  const onConfirmClose = vi.fn(async () => {
    throw new Error('net')
  })
  render(<CloseTicketButton closing={false} hasUnsentDraft={false} onConfirmClose={onConfirmClose} />)
  await userEvent.click(screen.getByRole('button', { name: '상담 종료' }))
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '상담 종료' }))
  expect(await screen.findByText(/종료하지 못했습니다/)).toBeInTheDocument()
})
