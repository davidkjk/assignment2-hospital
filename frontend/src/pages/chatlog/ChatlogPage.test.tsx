import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatlogPage } from './ChatlogPage'
import type { ChatLogApi } from '../../api/staffChatLog'
import type { ConvMessage } from '../../api/staffChatDetail'

const api: ChatLogApi = {
  listLogs: vi.fn(async () => [
    { threadId: 'th1', channel: 'web', routeTaken: 'handoff', summary: '예약 바꾸고 싶어요', at: '2026-08-19T01:00:00Z' },
  ]),
  listSources: vi.fn(async () => [{ rank: 1, similarity: 0.8, titleSnapshot: '예약 변경 안내', bodySnapshot: '...' }]),
}
const conv: ConvMessage[] = [
  { id: 'm1', sender: 'patient', body: '예약 바꾸고 싶어요', at: '01:00', patientRead: false, staffUnread: false, smsSent: false },
  { id: 'm2', sender: 'ai', body: '안내드립니다', at: '01:01', patientRead: false, staffUnread: false, smsSent: false },
]

describe('ChatlogPage (배선)', () => {
  it('[배선] 목록을 그리고 행을 열면 대화(TicketConversation 재사용)+봇 답변 근거가 보인다', async () => {
    render(<ChatlogPage api={api} fetchConversation={async () => conv} />)
    // 목록 — 앱·웹 한 목록
    expect(await screen.findByText('예약 바꾸고 싶어요')).toBeVisible()
    // 행 열기 → 상세 대화 + 봇 근거
    await userEvent.click(screen.getByText('예약 바꾸고 싶어요'))
    expect(await screen.findByLabelText('대화')).toBeVisible() // TicketConversation 재사용
    expect(await screen.findByText('예약 변경 안내')).toBeVisible() // 봇(ai) 답변 근거(ChatLogSources)
    expect(screen.getByRole('button', { name: /잘못된 답변 신고/ })).toBeVisible()
  })
})
