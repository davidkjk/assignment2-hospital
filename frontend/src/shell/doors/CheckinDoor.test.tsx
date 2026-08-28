import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../AppShell'
import { ConnectivityProvider } from '../../lib/connectivity'
import { queryClient } from '../../lib/queryClient'
import { server } from '../../test/msw/server'

// 접수 문(`SHELL-DOOR-04`) 배선 — 「예약 확인」 갈래는 `/checkin`과 **같은 컴포넌트**(CheckinForm)다.
// 여기서 보는 것은 문에서만 확인할 수 있는 것들: ①자리표시자가 아니라 진짜 폼이 붙었나
// ②떠날 때 패널을 닫고 가나(`PANEL-ONE-01` — 대기 목록 위에 문이 남아 있으면 안 된다).
// 폼 자체의 규칙(CHKIN-*)은 `pages/checkin/CheckInPage.test.tsx`가 지킨다 — 여기서 겹쳐 세지 않는다.
const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ staff, logout: vi.fn() }) }))
vi.mock('../../auth/useIdleLogout', () => ({ useIdleLogout: () => ({ isWarning: false, keepAlive: vi.fn() }) }))

function Probe() {
  const loc = useLocation()
  return <p>주소 {loc.pathname + loc.search}</p>
}

function renderShell() {
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <MemoryRouter initialEntries={['/today']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/today" element={<p>오늘의 현황 본문</p>} />
              <Route path="/queue" element={<Probe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}

function panel() {
  return screen.getByRole('complementary', { name: '접수' })
}

test('[SHELL-DOOR-04] 접수 문의 「예약 확인」 갈래는 진짜 조회 폼이다 — 자리표시자가 아니다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))

  expect(within(panel()).getByRole('button', { name: 'QR 스캔 시작' })).toBeVisible()
  expect(within(panel()).getByLabelText('QR이 없나요? 예약번호 직접 입력')).toBeVisible()
})

test('[CHKIN-RESULT-01] 문 안에서 조회하면 그 자리 카드로 확인한다 — 화면을 떠나지 않는다', async () => {
  const user = userEvent.setup()
  server.use(
    http.get('*/appointments/find-by-code', () =>
      HttpResponse.json({
        appointment: {
          appointment_id: 'a1',
          patient_name: '김민정',
          slot_at: '2026-08-28T01:30:00+00:00',
          department_name: '내과',
          doctor_name: '김의사',
          status: '예약확정',
          updated_at: 'T1',
        },
      }),
    ),
  )
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))
  await user.type(within(panel()).getByLabelText('QR이 없나요? 예약번호 직접 입력'), 'AB34CD{Enter}')

  const card = await screen.findByTestId('lookup-result')
  expect(within(card).getByText('김민정')).toBeVisible()
  expect(screen.getByText('오늘의 현황 본문')).toBeVisible() // 왼쪽은 보던 화면 그대로
})

test('[PANEL-ONE-01] 대기 목록으로 떠날 때 문을 닫고 간다 — 다음 화면 위에 패널이 남지 않는다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '접수' }))
  await user.click(within(panel()).getByRole('button', { name: '대기 목록으로' }))

  expect(screen.getByText('주소 /queue?tab=not_arrived')).toBeVisible()
  expect(screen.queryByRole('complementary', { name: '접수' })).toBeNull()
})
