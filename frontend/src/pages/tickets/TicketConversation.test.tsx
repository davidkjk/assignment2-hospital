import { it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TicketConversation } from './TicketConversation'
import type { ConvMessage } from '../../api/staffChatDetail'

const mk = (id: string, sender: ConvMessage['sender'], body: string, at: string): ConvMessage => ({
  id,
  sender,
  body,
  at,
  patientRead: false,
  staffUnread: false,
  smsSent: false,
})

it('[TICKET-DETAIL-CONV-01] AI·직원·환자 메시지와 상담 종료를 같은 상담방에 시간 순서·발신 주체 구분으로 표시한다', () => {
  const msgs = [
    mk('1', 'patient', '두통이 심해요', '09:00'),
    mk('2', 'ai', '증상 확인할게요', '09:01'),
    mk('3', 'staff', '직원입니다', '09:05'),
    mk('4', 'system', '상담이 종료되었습니다', '09:10'),
  ]
  render(<TicketConversation messages={msgs} convError={false} onRetryConv={() => {}} />)
  const items = screen.getAllByRole('listitem')
  expect(items.map((li) => li.getAttribute('data-sender'))).toEqual(['patient', 'ai', 'staff', 'system']) // 시간 순서
  expect(within(items[2]).getByText('직원')).toBeInTheDocument() // 발신 주체 구분
})

it('[TICKET-DETAIL-EMPTY-01] 티켓은 있으나 대화 0건이면 원본 대화가 없습니다를 표시하고 오류·로딩으로 위장하지 않는다', () => {
  render(<TicketConversation messages={[]} convError={false} onRetryConv={() => {}} />)
  expect(screen.getByText('원본 대화가 없습니다')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-ERR-01] 요약은 성공하고 대화만 실패하면 대화 영역에만 오류+다시 시도를 표시한다', () => {
  const retry = vi.fn()
  render(<TicketConversation messages={[]} convError={true} onRetryConv={retry} />)
  expect(within(screen.getByRole('alert')).getByText('대화를 불러오지 못했습니다')).toBeInTheDocument()
  screen.getByText('다시 시도').click()
  expect(retry).toHaveBeenCalled()
})
