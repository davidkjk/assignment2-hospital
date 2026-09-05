import { it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Realtime 훅 모킹 — 실제 채널을 열지 않는다(하네스 관례).
vi.mock('./useTicketsRealtime', () => ({ useTicketsRealtime: () => {} }))

import { Tickets } from './Tickets'
import { TicketClaimConflict, type StaffChatApi, type InboxTicket } from '../../api/staffChat'

const pend = (id: string, over: Partial<InboxTicket> = {}): InboxTicket => ({
  id,
  status: 'pending',
  patientQuestion: '두통이 심해요',
  handoffReason: '약 정보',
  createdAt: '2026-08-19T08:00',
  assigneeName: null,
  isMine: false,
  requestType: null,
  appointmentSummary: null,
  ...over,
})

function fakeApi(over: Partial<StaffChatApi> = {}): StaffChatApi {
  return {
    listTickets: vi.fn(async () => [pend('t1')]),
    claimTicket: vi.fn(async () => ({ ...pend('t1'), status: 'in_progress', assigneeName: '나' })),
    ...over,
  } as StaffChatApi
}

it('[TICKET-INBOX-ROW-01] 행은 환자 질문·인계 이유·담당자를 표시하고 예약 상담이면 상담 유형·요약을 함께 보인다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async () => [pend('t1', { requestType: 'cancel', appointmentSummary: '8/20 내과', assigneeName: null })]),
  })
  render(<Tickets api={api} detailSlot={() => null} />)
  const row = await screen.findByText('두통이 심해요')
  const li = row.closest('li')!
  expect(within(li).getByText(/인계 이유: 약 정보/)).toBeInTheDocument()
  expect(within(li).getByText('담당: 미배정')).toBeInTheDocument()
  expect(within(li).getByText('취소 상담')).toBeInTheDocument()
  expect(within(li).getByText(/8\/20 내과/)).toBeInTheDocument()
})

it('[이관알림] 내게 배정된 행은 「내 담당」으로 강조한다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async () => [
      pend('t1', { status: 'in_progress', assigneeName: '나', isMine: true }),
      pend('t2', { status: 'in_progress', assigneeName: '김직원', isMine: false, patientQuestion: '접수 문의' }),
    ]),
  })
  render(<Tickets api={api} detailSlot={() => null} />)
  const mine = (await screen.findByText('두통이 심해요')).closest('li')!
  const other = (await screen.findByText('접수 문의')).closest('li')!
  expect(within(mine).getByText('내 담당')).toBeInTheDocument()
  expect(within(other).queryByText('내 담당')).toBeNull()
})

it('[TICKET-INBOX-ROW-01] 새 문의 행 선택은 원자 배정(claim) 승자면 오른쪽 상세를 연다', async () => {
  const api = fakeApi()
  render(<Tickets api={api} detailSlot={(t) => (t ? <div>상세:{t.id}</div> : null)} />)
  await userEvent.click(await screen.findByText('두통이 심해요'))
  await waitFor(() => expect(api.claimTicket).toHaveBeenCalledWith('t1'))
  expect(await screen.findByText('상세:t1')).toBeInTheDocument()
})

it('[TICKET-INBOX-ROW-01] 경쟁 패자는 상세를 열지 않고 목록을 유지한 채 「이미 다른 직원이 맡았어요」와 최신 담당자를 확인한다', async () => {
  const listMock = vi
    .fn()
    .mockResolvedValueOnce([pend('t1')])
    .mockResolvedValueOnce([pend('t1', { assigneeName: '김직원' })]) // 재조회 → 최신 담당자
  const api = fakeApi({
    listTickets: listMock,
    claimTicket: vi.fn(async () => {
      throw new TicketClaimConflict('이미 다른 직원이 맡았어요.')
    }),
  })
  render(<Tickets api={api} detailSlot={(t) => (t ? <div>상세:{t.id}</div> : null)} />)
  await userEvent.click(await screen.findByText('두통이 심해요'))
  expect(await screen.findByRole('alert')).toHaveTextContent('이미 다른 직원이 맡았어요')
  expect(screen.queryByText('상세:t1')).not.toBeInTheDocument() // 상세 안 엶
  await waitFor(() => expect(screen.getByText('담당: 김직원')).toBeInTheDocument()) // 최신 담당자
})

it('[TICKET-INBOX-SCOPE-01] 폐지된 취소요청 대기열(/cancellation-requests) 경로·화면·빈 상태를 만들지 않는다', async () => {
  render(<Tickets api={fakeApi()} detailSlot={() => null} />)
  expect(screen.queryByText(/취소요청 대기열|cancellation-requests/)).not.toBeInTheDocument()
})
