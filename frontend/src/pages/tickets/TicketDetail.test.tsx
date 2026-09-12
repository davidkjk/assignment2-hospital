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
  contact: { anonymous: false, hasPhone: false, name: null },
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

it('[TICKET-DETAIL-APPLICANT-01 개정 · G3] 익명 웹 상담은 신청자 자기입력 이름을 헤더 배지(신청자)로 보이되, 대화 본문엔 이름 없는 연결 안내만 남긴다', async () => {
  // ⚠️ F7 뒤집음(~~"익명은 이름 배지 없음"~~): 사용자 결정 2026-09-11 — 앱(로그인)만 이름이 뜨고 웹챗 입력
  //   이름이 안 떠 직원이 상대를 못 알아본 문제. 익명 자기입력은 미검증이라 '환자'가 아니라 '신청자'로 라벨.
  const anon: StaffTicketDetailApi = {
    ...fakeApi(),
    getDetail: vi.fn(async () => ({
      ...detail,
      contact: { anonymous: true, hasPhone: true, name: '박익명' },   // 신청자가 폼에 입력한 이름
      messages: [
        { id: 's1', sender: 'system', body: '상담이 직원에게 연결되었습니다', at: '09:00', patientRead: false, staffUnread: false, smsSent: false },
        { id: 'm1', sender: 'patient', body: '예약 취소하고 싶어요', at: '09:01', patientRead: false, staffUnread: false, smsSent: false },
      ],
    })),
  } as unknown as StaffTicketDetailApi
  render(<TicketDetail api={anon} ticket={ticket} onLoserBackToList={vi.fn()} />)
  const badge = await screen.findByLabelText('신청자')
  expect(badge).toHaveTextContent('박익명')                                // 익명 → '신청자' 배지에 자기입력 이름
  expect(screen.queryByLabelText('환자')).not.toBeInTheDocument()          // '환자'(계정 실명) 라벨은 아님
  expect(screen.queryByText(/상담 신청자/)).not.toBeInTheDocument()         // 대화 본문엔 여전히 '상담 신청자: 이름' 없음
})

it('[TICKET-DETAIL-APPLICANT-02 개정 · F9] 로그인 환자 인계는 계정 실명을 헤더 배지로 보인다', async () => {
  const named: StaffTicketDetailApi = {
    ...fakeApi(),
    getDetail: vi.fn(async () => ({ ...detail, contact: { anonymous: false, hasPhone: false, name: '김환자' } })),
  } as unknown as StaffTicketDetailApi
  render(<TicketDetail api={named} ticket={ticket} onLoserBackToList={vi.fn()} />)
  const badge = await screen.findByLabelText('환자')
  expect(badge).toHaveTextContent('김환자')
})

it('[TICKET-DETAIL-APPLICANT-03] 이름이 없는 티켓(익명·이름 미보유)에는 신원 배지를 두지 않는다', async () => {
  render(<TicketDetail api={fakeApi()} ticket={ticket} onLoserBackToList={vi.fn()} />)  // 기본 fixture name:null
  await waitFor(() => expect(screen.getByLabelText('대화')).toBeInTheDocument())
  expect(screen.queryByLabelText('환자')).not.toBeInTheDocument()
})
