import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { AppointmentPanel, type AppointmentDetail } from './AppointmentPanel'

const APPT: AppointmentDetail = {
  appointmentId: 'a1',
  patientLabel: '김*지 님',
  statusLabel: '확정',
  doctorLabel: '내과 / 박지훈',
  timeLabel: '2026-08-17 10:00',
}

test('[CAL-PANEL-04] 본문 머리에 환자 이름과 상태가 보인다 (✕ 닫기는 패널 머리 PanelHost가 준다)', () => {
  render(<AppointmentPanel appointment={APPT} />)
  expect(screen.getByRole('heading')).toHaveTextContent('김*지 님')
  expect(screen.getByText('확정')).toBeVisible()
})

test('[CAL-PANEL-01] 패널에 [예약 변경]이 있다(딥링크로 들어오면 이 글자가 보인다)', () => {
  render(<AppointmentPanel appointment={APPT} />)
  expect(screen.getByRole('button', { name: '예약 변경' })).toBeVisible()
})

test('[SUPPORT-CAL-WARN-02] 취소 상담과 변경 상담을 글자로 구분한다', () => {
  const { rerender } = render(
    <AppointmentPanel appointment={APPT} support={{ type: 'cancel', ownerLabel: '김접수', load: 'ready' }} />,
  )
  expect(screen.getByText('취소 상담')).toBeVisible()
  rerender(<AppointmentPanel appointment={APPT} support={{ type: 'reschedule', ownerLabel: '김접수', load: 'ready' }} />)
  expect(screen.getByText('변경 상담')).toBeVisible()
})

test('[SUPPORT-CAL-WARN-03] 상담 요약은 담당만 짧게 보이고 전체 대화를 복제하지 않는다', () => {
  render(<AppointmentPanel appointment={APPT} support={{ type: 'cancel', ownerLabel: '김접수', load: 'ready' }} />)
  expect(screen.getByTestId('support-summary')).toHaveTextContent('담당: 김접수')
  expect(screen.queryByText(/대화 전체/)).toBeNull()
})

test('[SUPPORT-CAL-LOAD-01] 상담 상태가 늦으면 「확인 중」이고 예약 블록은 유지한다', () => {
  render(<AppointmentPanel appointment={APPT} support={{ type: 'cancel', load: 'loading' }} />)
  expect(screen.getByText('확인 중')).toBeVisible()
})

test('[SUPPORT-CAL-ERR-01] 상담 상태 조회가 실패하면 「없음」으로 위장하지 않고 실패를 밝힌다', () => {
  render(<AppointmentPanel appointment={APPT} support={{ type: 'cancel', load: 'error' }} />)
  expect(screen.getByText('상담 상태를 확인할 수 없습니다')).toBeVisible()
})

test('[CAL-PANEL-01] 예약 취소는 사유를 물은 뒤 사유와 함께 콜백한다(되돌릴 수 없어 확인창 안에서만)', async () => {
  const user = userEvent.setup()
  const onCancel = vi.fn()
  render(<AppointmentPanel appointment={APPT} onCancel={onCancel} />)
  await user.click(screen.getByRole('button', { name: '예약 취소' }))
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox'), '환자 요청')
  await user.click(within(dialog).getByRole('button', { name: '확인' }))
  expect(onCancel).toHaveBeenCalledWith('환자 요청')
})

test('[SUPPORT-CAL-DUP-01] 한 예약에 상담 기록이 여럿이면 대표 하나만 그리고 「상담 N건」을 병기한다', () => {
  render(
    <AppointmentPanel
      appointment={APPT}
      support={{ type: 'cancel', ticketId: 't1', count: 3, load: 'ready' }}
    />,
  )
  // ⚠ 대표 하나(취소 상담) + 개수 병기 — 겹쳐 그리지 않는다.
  const summary = screen.getByTestId('support-summary')
  expect(summary).toHaveTextContent('취소 상담')
  expect(summary).toHaveTextContent('상담 3건')
  expect(within(summary).queryByText('변경 상담')).toBeNull() // 대표 하나만
  expect(screen.getByText('상담 3건')).toBeVisible()
})

test('[SUPPORT-PANEL-CONTEXT-01] [상담 전체 보기]는 전체 대화를 복제하지 않고 대표 티켓으로 문의함 이동을 요청한다', async () => {
  const user = userEvent.setup()
  const onOpenTicket = vi.fn()
  render(
    <AppointmentPanel
      appointment={APPT}
      support={{ type: 'cancel', ticketId: 't1', count: 1, load: 'ready' }}
      onOpenTicket={onOpenTicket}
    />,
  )
  expect(screen.getByText(/읽기 전용/)).toBeVisible() // 답장·대화 전체는 문의함에서
  await user.click(screen.getByRole('button', { name: '상담 전체 보기' }))
  expect(onOpenTicket).toHaveBeenCalledWith('t1')
})

test('[SUPPORT-PANEL-CONTEXT-01] 대표 티켓이 없으면 [상담 전체 보기]를 만들지 않는다', () => {
  render(<AppointmentPanel appointment={APPT} support={{ type: 'cancel', load: 'ready' }} />)
  expect(screen.queryByRole('button', { name: '상담 전체 보기' })).toBeNull()
})
