import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Header } from './Header'
import type { PatientDetail } from '../../api/patients'

function patient(over: Partial<PatientDetail> = {}): PatientDetail {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? '김환자',
    birth_date: over.birth_date ?? '1990-05-14',
    gender: over.gender ?? 'F',
    phone: over.phone ?? '010-1234-5678',
    sms_dead: over.sms_dead,
    sms_dead_checked_at: over.sms_dead_checked_at,
  }
}

// [SEND-DEAD-01] /patients/:id 헤더 — 번호 아래 죽은 번호 표식 + [번호 고치기].
test('[SEND-DEAD-01] sms_dead면 「문자가 가지 않습니다」와 [번호 고치기]가 뜬다', () => {
  render(
    <Header
      patient={patient({ sms_dead: true, sms_dead_checked_at: '2026-08-20T09:00:00+09:00' })}
      role="receptionist"
      onChangePhone={() => {}}
    />,
  )
  expect(screen.getByText('이 번호로 문자가 가지 않습니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '번호 고치기' })).toBeVisible()
})

test('[SEND-DEAD-01] sms_dead가 아니면 표식이 없다(0을 그리지 않는다)', () => {
  render(<Header patient={patient({ sms_dead: false })} role="receptionist" onChangePhone={() => {}} />)
  expect(screen.queryByTestId('contact-status')).toBeNull()
})

test('[SEND-DEAD-02] [번호 고치기]는 번호 변경 흐름을 연다', async () => {
  const user = userEvent.setup()
  const onChangePhone = vi.fn()
  render(<Header patient={patient({ sms_dead: true })} role="receptionist" onChangePhone={onChangePhone} />)
  await user.click(screen.getByRole('button', { name: '번호 고치기' }))
  expect(onChangePhone).toHaveBeenCalledOnce()
})
