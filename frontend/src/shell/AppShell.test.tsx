import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import { AppShell } from './AppShell'
import { ConnectivityProvider } from '../lib/connectivity'
import { queryClient } from '../lib/queryClient'
import { usePanel } from '../components/PanelHost'

const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

// 셸 렌더에 필요한 최소 의존만 대체한다 — 배선(배너·패널 그릇)만 본다.
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ staff, logout: vi.fn() }) }))
vi.mock('../auth/useIdleLogout', () => ({ useIdleLogout: () => ({ isWarning: false, keepAlive: vi.fn() }) }))

function setBrowserOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

// 소비 화면 역할 — usePanel이 PanelProvider 안에서 동작함을 증명한다(그릇이 마운트됐다는 뜻).
function PanelOpener() {
  const { openPanel } = usePanel()
  return <button onClick={() => openPanel({ title: '김민정 님 예약', content: <p>폼 내용</p> })}>패널 열기</button>
}

function renderShell() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <MemoryRouter initialEntries={['/queue']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/queue" element={<PanelOpener />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}

test('[OFFX-STAFF-01] 연결이 끊기면 셸 맨 위에 오프라인 띠가 뜬다(OfflineBanner 마운트)', () => {
  renderShell()
  expect(screen.queryByText('인터넷이 연결되어 있지 않습니다')).toBeNull()
  act(() => setBrowserOnline(false))
  expect(screen.getByText('인터넷이 연결되어 있지 않습니다')).toBeVisible()
})

test('[PANEL-ONE-01] 셸이 PanelProvider·PanelHost를 감싸 소비 화면이 하나뿐인 패널을 연다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '패널 열기' }))
  expect(screen.getByText('김민정 님 예약')).toBeVisible()
  expect(screen.getByText('폼 내용')).toBeVisible()
})
