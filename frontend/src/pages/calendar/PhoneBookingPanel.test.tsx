import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { PhoneBookingPanel } from './PhoneBookingPanel'
import { ApiError } from '../../api/httpClient'
import type { GridDoctor } from './gridModel'
import type { CalendarBusy } from './snap'

const DOCTORS: GridDoctor[] = [
  { id: 'd1', name: '박지훈', departmentName: '내과', paletteIndex: 3, slotMinutes: 15 },
]

/** 그 날의 **병원 시각**(TIME-TZ-01) — 패널이 병원 시각으로 계산하므로 기준을 맞춘다. */
function at(hhmm: string): Date {
  return new Date(`2026-08-17T${hhmm}:00+09:00`)
}

function renderPanel(props: Partial<React.ComponentProps<typeof PhoneBookingPanel>> = {}) {
  return render(
    <PhoneBookingPanel
      doctors={DOCTORS}
      initial={{ patient: { id: 'p1', name: '김민지' }, doctorId: 'd1', date: '2026-08-17', time: '10:00' }}
      createFn={vi.fn().mockResolvedValue({ appointment_id: 'new' })}
      {...props}
    />,
  )
}

test('[CAL-BOOK-01] 패널에 환자·의사·날짜·시간·사유가 위에서 아래 순서로 있다', () => {
  renderPanel()
  const labels = Array.from(document.querySelectorAll('.cal-field-label')).map((n) => n.textContent)
  expect(labels).toEqual(['환자', '의사', '날짜', '시간', '사유'])
})

test('[CAL-BOOK-03] 캘린더에서 열면 의사·날짜·시간이 채워진 채 뜬다', () => {
  renderPanel()
  expect(screen.getByLabelText('환자')).toHaveValue('김민지')
  expect(screen.getByLabelText('시간')).toHaveValue('10:00')
})

test('[CAL-BOOK-08][QUEUE-SAME-01] 저장을 누르면 「이 내용으로 예약할까요」 재확인이 먼저 뜬다', async () => {
  const user = userEvent.setup()
  renderPanel()
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('이 내용으로 예약할까요?')
})

test('[CAL-BOOK-08] 재확인에서 [예약]을 누르면 서버에 저장하고 onSaved가 온다', async () => {
  const user = userEvent.setup()
  const createFn = vi.fn().mockResolvedValue({ appointment_id: 'new' })
  const onSaved = vi.fn()
  renderPanel({ createFn, onSaved })
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  await user.click(await screen.findByRole('button', { name: '예약' }))
  // start_at은 **병원 10:00**을 못박아 보낸다(TIME-TZ-01) — 오프셋 없는 문자열은 서버 설정에 기댄다.
  expect(createFn).toHaveBeenCalledWith(expect.objectContaining({
    patient_id: 'p1', doctor_id: 'd1', start_at: at('10:00').toISOString(), allow_overlap: false,
  }))
  expect(onSaved).toHaveBeenCalledWith('new')
})

test('[CAL-GAP-05][CAL-GAP-06] 겹치면 누구와 몇 분 겹치는지 적고 진행 버튼은 「알겠습니다, 그대로 잡기」다', async () => {
  const user = userEvent.setup()
  const busy: CalendarBusy[] = [{ appointmentId: 'a1', startAt: at('10:20'), endAt: at('10:35'), patientLabel: '정우성 님' }]
  renderPanel({ initial: { patient: { id: 'p1', name: '김민지' }, doctorId: 'd1', date: '2026-08-17', time: '10:15' }, busyFor: () => busy })
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  const dialog = await screen.findByRole('dialog', { name: '끼워넣기 경고' })
  expect(dialog).toHaveTextContent('진료 15분으로 잡으면 다음 예약(정우성 님 10:20)과 10분 겹칩니다')
  expect(within(dialog).getByRole('button', { name: '그만두기' })).toBeVisible()
  expect(within(dialog).getByRole('button', { name: '알겠습니다, 그대로 잡기' })).toBeVisible()
})

test('[CAL-GAP-06] [그대로 잡기]는 allow_overlap=true로 저장한다', async () => {
  const user = userEvent.setup()
  const createFn = vi.fn().mockResolvedValue({ appointment_id: 'new' })
  const busy: CalendarBusy[] = [{ appointmentId: 'a1', startAt: at('10:20'), endAt: at('10:35'), patientLabel: '정우성 님' }]
  renderPanel({ createFn, busyFor: () => busy, initial: { patient: { id: 'p1', name: '김민지' }, doctorId: 'd1', date: '2026-08-17', time: '10:15' } })
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  await user.click(await screen.findByRole('button', { name: '알겠습니다, 그대로 잡기' }))
  expect(createFn).toHaveBeenCalledWith(expect.objectContaining({ allow_overlap: true }))
})

test('[CAL-RACE-03][CAL-RACE-07] 409면 패널은 그대로, 시간 칸만 비우고 사유·환자는 남는다', async () => {
  const user = userEvent.setup()
  const createFn = vi.fn().mockRejectedValue(new ApiError('다른 시간을 선택하세요', 409))
  renderPanel({ createFn, initial: { patient: { id: 'p1', name: '김민지' }, doctorId: 'd1', date: '2026-08-17', time: '10:00' } })
  await user.type(screen.getByLabelText('사유'), '감기 증상')
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  await user.click(await screen.findByRole('button', { name: '예약' }))
  expect(await screen.findByText('방금 다른 직원이 이 자리를 잡았습니다')).toBeVisible()
  expect(screen.getByLabelText('시간')).toHaveValue('')
  expect(screen.getByLabelText('환자')).toHaveValue('김민지')
  expect(screen.getByLabelText('사유')).toHaveValue('감기 증상')
  expect(screen.queryByText(/새로고침|다른 시간을 선택/)).toBeNull()
})

test('[A5] 정원을 채운 날은 정원 초과로 경고하고, [그래도 예약]은 넘겨 저장한다', async () => {
  const user = userEvent.setup()
  const createFn = vi.fn()
    .mockRejectedValueOnce(new ApiError('이 날은 예약 정원(2명)을 채웠습니다.', 409, { reason: 'over_daily_max', max: 2 }))
    .mockResolvedValueOnce({ appointment_id: 'over-1' })
  const onSaved = vi.fn()
  renderPanel({ createFn, onSaved, initial: { patient: { id: 'p1', name: '김민지' }, doctorId: 'd1', date: '2026-08-17', time: '10:00' } })
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  await user.click(await screen.findByRole('button', { name: '예약' }))
  // 자리 뺏김 문구가 아니라 정원 초과 확인창 — 넘길 길을 준다(막다른 길 금지).
  await user.click(await screen.findByRole('button', { name: '그래도 예약' }))
  expect(createFn).toHaveBeenLastCalledWith(expect.objectContaining({ allow_over_daily_max: true }))
  expect(onSaved).toHaveBeenCalledWith('over-1')
  expect(screen.queryByText('방금 다른 직원이 이 자리를 잡았습니다')).toBeNull()
})

test('[CAL-RACE-06] 시간이 빈 채 저장하면 그 칸에 「시간을 고르세요」가 뜬다', async () => {
  const user = userEvent.setup()
  renderPanel({ initial: { patient: { id: 'p1', name: '김민지' }, doctorId: 'd1', date: '2026-08-17', time: '' } })
  await user.click(screen.getByRole('button', { name: '예약 저장' }))
  expect(screen.getByTestId('time-error')).toHaveTextContent('시간을 고르세요')
})

test('[CAL-BOOK-01] 환자를 검색해 고르면 이름이 환자 칸에 든다', async () => {
  const user = userEvent.setup()
  const searchPatientsFn = vi.fn().mockResolvedValue([{ id: 'p9', name: '김민지', birth: '1985-03-12' }])
  renderPanel({ initial: { doctorId: 'd1', date: '2026-08-17', time: '10:00' }, searchPatientsFn })
  await user.type(screen.getByLabelText('환자'), '010')
  const results = await screen.findByTestId('patient-results')
  await user.click(within(results).getByRole('button', { name: /김민지/ }))
  expect(screen.getByLabelText('환자')).toHaveValue('김민지')
})
