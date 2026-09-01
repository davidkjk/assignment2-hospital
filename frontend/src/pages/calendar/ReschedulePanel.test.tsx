import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ReschedulePanel } from './ReschedulePanel'

const BASE = {
  patientLabel: '김*지 님',
  doctorLabel: '내과 / 박지훈',
  chosenTimeLabel: null as string | null,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

test('[CAL-RACE-03] 변경 중에도 환자·의사는 채워진 채로 보인다', () => {
  render(<ReschedulePanel {...BASE} />)
  expect(screen.getByRole('heading')).toHaveTextContent('김*지 님')
  expect(screen.getByText('내과 / 박지훈')).toBeVisible()
})

test('[CAL-PANEL-02] 아직 새 시각을 안 골랐으면 왼쪽 캘린더에서 고르라고 안내하고 저장은 막힌다', () => {
  render(<ReschedulePanel {...BASE} chosenTimeLabel={null} />)
  expect(screen.getByText(/왼쪽 캘린더에서 새 시각을 고르세요/)).toBeVisible()
  expect(screen.getByRole('button', { name: '예약 변경 저장' })).toBeDisabled()
})

test('[schedule-change] 새 시각은 골랐지만 사유가 비면 저장은 막힌다(백엔드가 사유 필수)', () => {
  render(<ReschedulePanel {...BASE} chosenTimeLabel="2026-08-20 14:00" />)
  expect(screen.getByText('2026-08-20 14:00')).toBeVisible()
  expect(screen.getByRole('button', { name: '예약 변경 저장' })).toBeDisabled()
})

test('[schedule-change] 새 시각과 사유가 모두 있으면 사유와 함께 저장을 콜백한다', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<ReschedulePanel {...BASE} chosenTimeLabel="2026-08-20 14:00" onSubmit={onSubmit} />)
  await user.type(screen.getByLabelText('변경 사유'), '환자 요청으로 시간 이동')
  await user.click(screen.getByRole('button', { name: '예약 변경 저장' }))
  expect(onSubmit).toHaveBeenCalledWith('환자 요청으로 시간 이동')
})

test('[G1][CAL-RACE-04] 저장이 실패하면 무동작 대신 이유를 알린다', () => {
  render(<ReschedulePanel {...BASE} chosenTimeLabel="2026-08-20 14:00" actionError="방금 다른 직원이 이 자리를 잡았습니다" />)
  expect(screen.getByRole('alert')).toHaveTextContent('방금 다른 직원이 이 자리를 잡았습니다')
})

test('그만두기는 onCancel을 부른다(막다른 길 금지)', async () => {
  const user = userEvent.setup()
  const onCancel = vi.fn()
  render(<ReschedulePanel {...BASE} onCancel={onCancel} />)
  await user.click(screen.getByRole('button', { name: '그만두기' }))
  expect(onCancel).toHaveBeenCalled()
})
