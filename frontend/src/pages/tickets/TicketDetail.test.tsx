import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { InboxTicket } from '../../api/staffChat'
import type { StaffTicketDetailApi, TicketDetail as TD } from '../../api/staffChatDetail'

// 상세 라이브 훅을 모킹(실제 채널 미개통).
vi.mock('./useTicketDetailRealtime', () => ({ useTicketDetailRealtime: () => {} }))

import { TicketDetail } from './TicketDetail'

const ticket: InboxTicket = {
  id: 't1',
  status: 'in_progress',
  patientQuestion: '두통',
  handoffReason: '약',
  createdAt: '2026-09-01T09:00',
  assigneeName: '나',
  isMine: true,
  requestType: null,
  appointmentSummary: null,
}
const detail: TD = {
  id: 't1',
  status: 'in_progress',
  reason: 'general',
  assignee: { name: '나', role: 'reception' },
  isMine: true,
  summary: { patientAsked: '두통약', botConfirmed: null, alreadyGuided: null, unresolvedReason: null, staffShouldCheck: null },
  messages: [{ id: 'm1', sender: 'patient', body: '질문', at: '09:00', patientRead: false, staffUnread: false, smsSent: false }],
  contact: { anonymous: false, hasPhone: false },
}
function fakeApi(): StaffTicketDetailApi {
  return {
    getDetail: vi.fn(async () => detail),
    claim: vi.fn(async () => detail),
    sendMessage: vi.fn(),
    closeTicket: vi.fn(),
    reassignTicket: vi.fn(),
    markRead: vi.fn(async () => {}),
    listActiveStaff: vi.fn(async () => []),
  } as unknown as StaffTicketDetailApi
}

it('[TICKET-DETAIL-LAYOUT-01] 위에서 아래로 담당 이관 → 인계 요약 → 전체 대화 → 답변 입력/보내기 → 따로 상담 종료 순으로 배치한다', async () => {
  render(<TicketDetail api={fakeApi()} ticket={ticket} onLoserBackToList={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('인계 요약')).toBeInTheDocument())
  const regions = ['담당 이관', '인계 요약', '대화', '답변 작성', '상담 종료'].map((l) => screen.getByLabelText(l))
  for (let i = 0; i < regions.length - 1; i++) {
    expect(regions[i].compareDocumentPosition(regions[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
})

it('[TICKET-DETAIL-SCOPE-01] 온라인 초록 점·사진·파일·음성·메시지 반응을 만들지 않는다', async () => {
  const { container } = render(<TicketDetail api={fakeApi()} ticket={ticket} onLoserBackToList={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('대화')).toBeInTheDocument())
  expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument()
  expect(screen.queryByText(/온라인|사진 첨부|음성|반응 추가/)).not.toBeInTheDocument()
})
