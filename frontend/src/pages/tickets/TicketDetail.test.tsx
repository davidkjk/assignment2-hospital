import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { InboxTicket } from '../../api/staffChat'
import type { StaffTicketDetailApi, TicketDetail as TD } from '../../api/staffChatDetail'

// 상세 라이브 훅을 모킹(실제 채널 미개통).
vi.mock('./useTicketDetailRealtime', () => ({ useTicketDetailRealtime: () => {} }))
// 타이핑/열람 채널 모킹 — 환자 presence 값을 테스트가 제어한다(실제 realtime 없이 표시 배선 검증).
const typingState = { send: vi.fn(), patientTyping: false, patientViewing: false }
vi.mock('./useTypingChannel', () => ({ useTypingChannel: () => typingState }))

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
  threadId: 'th-1',
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

it('[TICKET-DETAIL-PATIENT-TYPING-01] 환자가 입력 중이면 상단에 "환자 입력 중"을 표시한다', async () => {
  typingState.patientTyping = true
  typingState.patientViewing = true
  try {
    render(<TicketDetail api={fakeApi()} ticket={ticket} onLoserBackToList={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('환자 입력 중')).toBeInTheDocument())
  } finally {
    typingState.patientTyping = false
    typingState.patientViewing = false
  }
})

it('[TICKET-DETAIL-APPLICANT-01] 익명 인계 신청자 이름을 헤더 배지로 끌어올려 스크롤 없이 보이게 한다', async () => {
  const withApplicant: StaffTicketDetailApi = {
    ...fakeApi(),
    getDetail: vi.fn(async () => ({
      ...detail,
      contact: { anonymous: true, hasPhone: true },
      messages: [
        { id: 's1', sender: 'system', body: '상담 신청자: 홍길동', at: '09:00', patientRead: false, staffUnread: false, smsSent: false },
        { id: 'm1', sender: 'patient', body: '예약 취소하고 싶어요', at: '09:01', patientRead: false, staffUnread: false, smsSent: false },
      ],
    })),
  } as unknown as StaffTicketDetailApi
  render(<TicketDetail api={withApplicant} ticket={ticket} onLoserBackToList={vi.fn()} />)
  // 헤더 배지는 aria-label로 타임라인의 같은 안내 줄과 구분한다.
  const badge = await screen.findByLabelText('상담 신청자')
  expect(badge).toHaveTextContent('홍길동')
})

it('[TICKET-DETAIL-APPLICANT-02] 신청자 안내가 없는 티켓(등록 환자·일반)에는 신청자 배지를 두지 않는다', async () => {
  render(<TicketDetail api={fakeApi()} ticket={ticket} onLoserBackToList={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('대화')).toBeInTheDocument())
  expect(screen.queryByLabelText('상담 신청자')).not.toBeInTheDocument()
})
