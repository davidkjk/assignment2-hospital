import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Header } from './Header'

const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

test('[SHELL-HDR-01] 종 없이 등록·접수·예약 세 문을 오른쪽에 둔다', () => {
  render(<Header staff={staff} onSignOut={vi.fn()} />)
  expect(screen.queryByLabelText(/알림/)).toBeNull()
  expect(screen.getAllByTestId('start-door').map((button) => button.textContent)).toEqual(['＋ 등록', '＋ 접수', '＋ 예약'])
})

test('[SHELL-HDR-03] 로그아웃은 항상 확인창을 거친다', async () => {
  const onSignOut = vi.fn()
  const user = userEvent.setup()
  render(<Header staff={staff} onSignOut={onSignOut} />)
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(screen.getByRole('dialog', { name: '로그아웃할까요?' })).toBeVisible()
  expect(onSignOut).not.toHaveBeenCalled()
})

test('[SHELL-ACT-03] 의사에게 세 문을 아예 그리지 않는다', () => {
  render(<Header staff={{ ...staff, role: 'doctor' }} onSignOut={vi.fn()} />)
  expect(screen.queryAllByTestId('start-door')).toHaveLength(0)
})
