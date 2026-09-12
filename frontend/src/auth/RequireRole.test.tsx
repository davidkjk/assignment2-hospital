import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { RequireRole } from './RequireRole'
import { NAV_ITEMS, canAccess } from '../shell/navItems'

test('[ROLE-ADM-01] 접수직원에게 열린 항목은 관리자에게도 열린다', () => {
  for (const item of NAV_ITEMS.filter((entry) => entry.roles.includes('receptionist'))) {
    expect(canAccess('admin', item)).toBe(true)
  }
})

test('[ROLE-DOC-01] 관리자는 의사 전용 진료 화면에 접근할 수 없다', () => {
  const consoleItem = NAV_ITEMS.find((entry) => entry.path === '/doctor/console')!
  expect(canAccess('admin', consoleItem)).toBe(false)
})

test('[NAV-SHELL-05] 권한 없는 URL은 로그인 대신 기본 화면 길을 제공한다', () => {
  render(
    <MemoryRouter initialEntries={['/admin/settings']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider initialAuth={{ session: { access_token: 'token' }, staff: { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist', departmentId: null, departmentName: null } }}>
        <RequireRole roles={['admin']}><p>관리 화면</p></RequireRole>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.getByText('이 화면을 볼 권한이 없습니다')).toBeVisible()
  expect(screen.getByRole('button', { name: '오늘의 현황으로 가기' })).toBeVisible()
  expect(screen.queryByText('직원 로그인')).toBeNull()
})

test('[NAV-SHELL-05] 기본 화면 버튼을 누르면 같은 세션의 기본 화면으로 간다', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/admin/settings']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider initialAuth={{ session: { access_token: 'token' }, staff: { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist', departmentId: null, departmentName: null } }}>
        <RequireRole roles={['admin']}><p>관리 화면</p></RequireRole>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: '오늘의 현황으로 가기' }))
  expect(screen.getByTestId('location')).toHaveTextContent('/today')
})

test('[ROLE-ADM-01] 경로 권한은 전달된 중복 역할 목록보다 NAV_ITEMS를 따른다', () => {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <AuthProvider initialAuth={{ session: { access_token: 'token' }, staff: { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'admin', departmentId: null, departmentName: null } }}>
        <RequireRole roles={['receptionist']}><p>오늘 화면</p></RequireRole>
      </AuthProvider>
    </MemoryRouter>,
  )
  expect(screen.getByText('오늘 화면')).toBeVisible()
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}
