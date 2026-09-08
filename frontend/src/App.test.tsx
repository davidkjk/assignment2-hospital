import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { expect, test } from 'vitest'
import { AuthProvider } from './auth/AuthProvider'
import type { Role } from './auth/roles'
import { HomeRedirect } from './App'

// 루트 `/`로 직접 들어오면 역할별 기본 화면으로 보낸다(NAV-SHELL-01·02).
// 없으면 셸 껍데기만 뜨고 본문이 빈 채 헤더가 「직원 업무」 기본값으로 뭉개진다.
function renderRoot(role: Role) {
  render(
    <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider initialAuth={{ session: { access_token: 'token' }, staff: { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role, departmentId: null, departmentName: null } }}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/today" element={<p>오늘의 현황</p>} />
          <Route path="/doctor/console" element={<p>진료 화면</p>} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}

test('[NAV-SHELL-01] 접수직원이 루트로 들어오면 오늘의 현황으로 보낸다', () => {
  renderRoot('receptionist')
  expect(screen.getByText('오늘의 현황')).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent('/today')
})

test('[NAV-SHELL-01] 관리자가 루트로 들어오면 오늘의 현황으로 보낸다', () => {
  renderRoot('admin')
  expect(screen.getByTestId('location')).toHaveTextContent('/today')
})

test('[NAV-SHELL-02] 의사가 루트로 들어오면 진료 화면으로 보낸다', () => {
  renderRoot('doctor')
  expect(screen.getByText('진료 화면')).toBeVisible()
  expect(screen.getByTestId('location')).toHaveTextContent('/doctor/console')
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}
