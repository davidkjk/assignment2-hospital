import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TicketConversation, messageBadges, ContactBanner } from './TicketConversation'
import type { ConvMessage } from '../../api/staffChatDetail'

const mk = (over: Partial<ConvMessage>): ConvMessage => ({
  id: 'm',
  sender: 'patient',
  body: 'x',
  at: '09:00',
  patientRead: false,
  staffUnread: false,
  smsSent: false,
  ...over,
})
const withBadges = (m: ConvMessage) => messageBadges(m).map((t) => <em key={t}>{t}</em>)

it('[TICKET-DETAIL-UNREAD-01] 미확인 환자 메시지는 새 메시지·미확인으로 묶어 표시하고 숫자 수량 배지를 두지 않는다', () => {
  const msgs = [mk({ id: '1', sender: 'patient', staffUnread: true }), mk({ id: '2', sender: 'patient', staffUnread: true })]
  render(<TicketConversation messages={msgs} convError={false} onRetryConv={() => {}} renderBadges={withBadges} />)
  expect(screen.getAllByText('새 메시지 · 미확인')).toHaveLength(2)
  expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument() // 숫자 배지 없음
})

it('[TICKET-DETAIL-READ-01] 환자가 아직 안 읽은 직원 메시지에 환자 미확인을 표시하되 전송 실패로 표현하지 않는다', () => {
  render(
    <TicketConversation
      messages={[mk({ id: '1', sender: 'staff', body: '답변', patientRead: false })]}
      convError={false}
      onRetryConv={() => {}}
      renderBadges={withBadges}
    />,
  )
  expect(screen.getByText('환자 미확인')).toBeInTheDocument()
  expect(screen.queryByText(/전송 실패|보내지 못/)).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-READ-02] 환자가 직원 메시지를 확인하면 환자 미확인만 해소하고 읽은 시각은 노출하지 않는다', () => {
  render(
    <TicketConversation
      messages={[mk({ id: '1', sender: 'staff', body: '답변', patientRead: true })]}
      convError={false}
      onRetryConv={() => {}}
      renderBadges={withBadges}
    />,
  )
  expect(screen.queryByText('환자 미확인')).not.toBeInTheDocument()
  expect(screen.queryByText(/읽음 \d|확인 시각|읽은 시각/)).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-NOTIFY-01] 미확인 연속 직원 답변은 화면이 환자 미확인 상태를 유지한다(발송을 표시하지 않음)', () => {
  const msgs = [mk({ id: '1', sender: 'staff', body: '답변1', patientRead: false }), mk({ id: '2', sender: 'staff', body: '답변2', patientRead: false })]
  render(<TicketConversation messages={msgs} convError={false} onRetryConv={() => {}} renderBadges={withBadges} />)
  expect(screen.getAllByText('환자 미확인')).toHaveLength(2)
})

it('[TICKET-DETAIL-NOTIFY-02] 이미 확인된 직원 답변만 있으면 답변 알림·문자 발송 표시를 만들지 않는다', () => {
  render(
    <TicketConversation
      messages={[mk({ id: '1', sender: 'staff', body: '답변', patientRead: true })]}
      convError={false}
      onRetryConv={() => {}}
      renderBadges={withBadges}
    />,
  )
  expect(screen.queryByText(/알림 발송|문자로 발송/)).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-NOTIFY-03] 자리 비움 발송된 직원 답변에 자리 비움·답변 문자로 발송됨을 작게 표시한다', () => {
  render(
    <TicketConversation
      messages={[mk({ id: '1', sender: 'staff', body: '답변', patientRead: false, smsSent: true })]}
      convError={false}
      onRetryConv={() => {}}
      renderBadges={withBadges}
    />,
  )
  expect(screen.getByText('자리 비움 · 답변 문자로 발송됨')).toBeInTheDocument()
})

it('[TICKET-DETAIL-NOTIFY-04] 전화번호 미제공이면 연락처 없음 안내만 표시하고 문자 발송됨을 표시하지 않는다', () => {
  render(
    <>
      <ContactBanner contact={{ anonymous: true, hasPhone: false }} />
      <TicketConversation
        messages={[mk({ id: '1', sender: 'staff', body: '답변', patientRead: false, smsSent: false })]}
        convError={false}
        onRetryConv={() => {}}
        renderBadges={withBadges}
      />
    </>,
  )
  expect(screen.getByText('연락처 없음 · 위젯 미읽음 점으로 안내')).toBeInTheDocument()
  expect(screen.queryByText(/문자로 발송됨/)).not.toBeInTheDocument()
})

it('[TICKET-DETAIL-CONTACT-01] 익명 웹 티켓은 실제 번호 대신 마스킹을 표시하고 직접 문자 버튼을 제공하지 않는다', () => {
  render(<ContactBanner contact={{ anonymous: true, hasPhone: true }} />)
  expect(screen.getByText('연락처 있음 · 문자 알림 가능')).toBeInTheDocument()
  expect(screen.queryByText(/010-|문자 보내기|직접 발송/)).not.toBeInTheDocument()
})
