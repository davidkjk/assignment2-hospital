import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { TicketRow } from './TicketRow'
import type { InboxTicket } from '../../api/staffChat'

// 문의함 왼쪽 열(w-96=384px)을 가로로 뚫지 않게 하는 회귀 가드.
// jsdom엔 레이아웃이 없어 실제 픽셀 오버플로는 못 재므로(그건 headless shot이 본다),
// 「긴 값이 삐져나오지 않게」 하는 CSS 계약(truncate·min-w-0·shrink-0)의 존재를 지킨다.

function t(over: Partial<InboxTicket> = {}): InboxTicket {
  return {
    id: 't1',
    status: 'pending',
    patientQuestion: '예약을 다음 주로 미룰 수 있나요?',
    handoffReason: '예약 변경은 직원 확인이 필요합니다',
    createdAt: '2026-09-08T03:43:00',
    assigneeName: null,
    isMine: false,
    requestType: 'reschedule',
    appointmentSummary: '9월 15일(화) 오후 2:30 · 정형외과 · 이민호 원장 · 초진예약건번호1234567890 확인요망',
    ...over,
  }
}

test('[TICKET-ROW] 긴 예약 요약은 열을 뚫지 않게 배지 줄에서 잘린다(truncate·min-w-0)', () => {
  render(<TicketRow ticket={t()} active={false} onSelect={vi.fn()} />)
  const summary = screen.getByText(/초진예약건번호1234567890/)
  // 요약 자체가 줄어 …처리
  expect(summary.className).toMatch(/\btruncate\b/)
  expect(summary.className).toMatch(/\bmin-w-0\b/)
  // 배지는 온전히(줄지 않음)
  const badge = screen.getByText('변경 상담')
  expect(badge.className).toMatch(/\bshrink-0\b/)
  // 배지·요약을 담은 flex 줄이 자식 축소를 허용(min-w-0)해야 truncate가 먹는다
  expect(badge.parentElement?.className).toMatch(/\bmin-w-0\b/)
})

test('[TICKET-ROW] 담당자 줄도 truncate로 단속되고 시각은 안 줄어든다', () => {
  render(<TicketRow ticket={t({ assigneeName: '아주아주긴이름의담당직원선생님' })} active={false} onSelect={vi.fn()} />)
  const assignee = screen.getByText(/담당: 아주아주긴이름/)
  expect(assignee.className).toMatch(/\btruncate\b/)
  const time = screen.getByText('9/8 03:43')
  expect(time.className).toMatch(/\bshrink-0\b/)
})
