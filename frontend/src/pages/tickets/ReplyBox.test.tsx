import { it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReplyBox } from './ReplyBox'

it('[TICKET-DETAIL-REPLY-01] 직원 답변을 입력해 여러 차례 보낼 수 있다', async () => {
  const onSend = vi.fn(async () => {})
  render(<ReplyBox readOnly={false} sending={false} onSend={onSend} />)
  await userEvent.type(screen.getByLabelText('답변'), '첫 답변')
  await userEvent.click(screen.getByText('보내기'))
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('첫 답변'))
  await userEvent.type(screen.getByLabelText('답변'), '둘째 답변')
  await userEvent.click(screen.getByText('보내기'))
  expect(onSend).toHaveBeenCalledTimes(2)
})

it('[TICKET-DETAIL-REPLY-02] 전송 중에는 중복 전송을 막고 전송 중 상태를 표시한다', () => {
  render(<ReplyBox readOnly={false} sending={true} onSend={vi.fn()} />)
  const btn = screen.getByRole('button', { name: /보내는 중/ })
  expect(btn).toBeDisabled()
  expect(btn).toHaveAttribute('aria-busy', 'true')
})

it('[TICKET-DETAIL-REPLY-03] 전송 실패면 티켓을 answered로 바꾸지 않고 입력을 보존하며 재시도 경로를 표시한다', async () => {
  const onSend = vi.fn(async () => {
    throw new Error('net')
  })
  render(<ReplyBox readOnly={false} sending={false} onSend={onSend} />)
  await userEvent.type(screen.getByLabelText('답변'), '보존될 답변')
  await userEvent.click(screen.getByText('보내기'))
  expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도')
  expect(screen.getByLabelText('답변')).toHaveValue('보존될 답변')
})

it('[TICKET-DETAIL-REPLY-04] 성공하면 입력을 비우고 보내기만으로 상담을 닫지 않는다', async () => {
  const onSend = vi.fn(async () => {})
  render(<ReplyBox readOnly={false} sending={false} onSend={onSend} />)
  await userEvent.type(screen.getByLabelText('답변'), '정상 답변')
  await userEvent.click(screen.getByText('보내기'))
  await waitFor(() => expect(screen.getByLabelText('답변')).toHaveValue(''))
  expect(screen.queryByText(/상담 종료|종료되었/)).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-REPLY-05] answered 티켓은 재답변하지 않고 재문의는 새 상담으로 접수됨을 안내한다', () => {
  render(<ReplyBox readOnly={true} sending={false} onSend={vi.fn()} />)
  expect(screen.getByText(/재문의는 새 상담으로/)).toBeInTheDocument()
  expect(screen.queryByLabelText('답변')).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-REPLY-06] Enter로 보내고 Shift+Enter는 줄바꿈이라 보내지 않는다', async () => {
  const onSend = vi.fn(async () => {})
  render(<ReplyBox readOnly={false} sending={false} onSend={onSend} />)
  const ta = screen.getByLabelText('답변')
  await userEvent.type(ta, '엔터로 전송')
  // Shift+Enter: 보내지 않고 줄바꿈만
  await userEvent.type(ta, '{Shift>}{Enter}{/Shift}')
  expect(onSend).not.toHaveBeenCalled()
  // Enter: 전송
  await userEvent.type(ta, '{Enter}')
  await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
  expect(onSend.mock.calls[0][0]).toContain('엔터로 전송')
})

it('[TICKET-DETAIL-REPLY-06] 한글 조합 중 Enter(글자 확정)는 전송하지 않는다', () => {
  const onSend = vi.fn(async () => {})
  render(<ReplyBox readOnly={false} sending={false} onSend={onSend} />)
  const ta = screen.getByLabelText('답변')
  fireEvent.change(ta, { target: { value: '가' } })
  // IME 조합 확정용 Enter: isComposing=true → 전송 금지
  fireEvent.keyDown(ta, { key: 'Enter', isComposing: true })
  expect(onSend).not.toHaveBeenCalled()
})
