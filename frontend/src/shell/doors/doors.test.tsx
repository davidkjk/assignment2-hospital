import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../AppShell'
import { ConnectivityProvider } from '../../lib/connectivity'
import { queryClient } from '../../lib/queryClient'
import { usePanel } from '../../components/PanelHost'

// 세 문(등록·접수·예약)은 화면 어디에도 속하지 않는 가로 장치다 — 셸 안에서만 확인할 수 있다.
// 여기서 보는 계약: 패널은 하나 · ✕는 묻지 않음 · 접기≠닫기 · ⭐**패널의 칸이 왼쪽을 정한다**.
const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ staff, logout: vi.fn() }) }))
vi.mock('../../auth/useIdleLogout', () => ({ useIdleLogout: () => ({ isWarning: false, keepAlive: vi.fn() }) }))

// 소비 화면 역할 — 세 문이 아닌 쪽(캘린더·검색 등)이 여는 패널을 흉내 낸다.
function QueueStub() {
  const { openPanel } = usePanel()
  return (
    <>
      <p>대기 목록 본문</p>
      <button onClick={() => openPanel({ title: '김민정 님 예약', content: <p>예약 상세</p> })}>예약 블록</button>
    </>
  )
}

function renderShell() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <MemoryRouter initialEntries={['/queue']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/queue" element={<QueueStub />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ConnectivityProvider>
    </QueryClientProvider>,
  )
}

/** 열려 있는 「만드는 중」 패널만 센다 — 사이드바 <aside>도 complementary라 이름으로 가른다. */
function openPanels(): HTMLElement[] {
  return screen.getAllByRole('complementary').filter((el) => el.hasAttribute('aria-label'))
}

/** 예약 문을 열고 환자 검색표에서 한 명을 고른다(왼쪽 도구를 실제로 쓰는 경로). */
// 왼쪽 환자 검색은 **정본 부품**(`PatientSearch`)이라 실 서버 창구(`GET /patients`)를 부른다
// — `SEARCH-BOX-03`(전역 검색은 창구 하나). 데모의 가짜 목록은 D3에서 걷어냈다.
function servePatient(name: string) {
  server.use(
    http.get('*/patients', () =>
      HttpResponse.json({
        rows: [{
          patient_id: 'p1',
          name,
          masked_phone: '010-****-9930',
          masked_birth_date: '1972-**-03',
          gender: 'M',
          matched: ['name'],
          today_status: null,
          today_appointment_time: null,
        }],
        next_cursor: null,
        has_more: false,
      }),
    ),
  )
}

async function openReserveAndPickPatient(user: ReturnType<typeof userEvent.setup>) {
  servePatient('김태호')
  await user.click(screen.getByRole('button', { name: '예약' }))
  await user.click(screen.getByRole('textbox', { name: '환자 검색' }))
  await user.paste('김태호')
  await user.keyboard('{Enter}')
  await user.click(await waitFor(() => screen.getByRole('button', { name: /김태호/ })))
}

test('[SHELL-DOOR-06][PANEL-WORK-01] 예약 문을 열면 오른쪽 패널이 열리고 왼쪽이 환자 검색 도구로 바뀐다', async () => {
  const user = userEvent.setup()
  renderShell()
  expect(screen.getByText('대기 목록 본문')).toBeVisible()

  await user.click(screen.getByRole('button', { name: '예약' }))

  expect(screen.getByRole('complementary', { name: '새 예약' })).toBeVisible()
  expect(screen.getByText('환자를 고르는 중')).toBeVisible()
  expect(screen.queryByText('대기 목록 본문')).toBeNull()
})

test('[SHELL-ACT-04] 등록 문은 왼쪽을 바꾸지 않는다 — 보던 화면 그대로다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '등록' }))

  expect(screen.getByRole('complementary', { name: '환자 등록' })).toBeVisible()
  expect(screen.getByText('대기 목록 본문')).toBeVisible()
})

test('[PANEL-ONE-01] 문을 바꿔 열어도 패널은 언제나 하나다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '등록' }))
  await user.click(screen.getByRole('button', { name: '예약' }))

  expect(openPanels()).toHaveLength(1)
  expect(screen.getByRole('complementary', { name: '새 예약' })).toBeVisible()
  expect(screen.queryByRole('complementary', { name: '환자 등록' })).toBeNull()
})

test('[PANEL-LIVE-06] ✕ 닫기는 확인창 없이 패널을 없앤다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '등록' }))
  await user.click(screen.getByRole('button', { name: '닫기' }))

  expect(openPanels()).toHaveLength(0)
  expect(screen.getByText('대기 목록 본문')).toBeVisible()
})

test('[PANEL-LIVE-03][PANEL-LIVE-05] 접기는 닫지 않는다 — 얇은 띠로 남고 왼쪽이 넓어진다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '예약' }))
  await user.click(screen.getByRole('button', { name: '접기' }))

  expect(screen.getByRole('button', { name: '패널 펼치기' })).toBeVisible()
  expect(screen.getByText('대기 목록 본문')).toBeVisible() // 도구가 걷히고 보던 화면이 넓어진다
})

test('[PANEL-WORK-02] 환자를 고르면 왼쪽이 그 환자 카드가 된다(창구에서 환자와 이야기하며 다음 칸을 채운다)', async () => {
  const user = userEvent.setup()
  renderShell()
  await openReserveAndPickPatient(user)

  expect(screen.getByText('김태호 님')).toBeVisible()
  expect(screen.getByText('이 환자와 이야기하며 오른쪽에서 담당 의사를 고르세요')).toBeVisible()
})

test('[PANEL-WORK-02] 의사를 고른 뒤 왼쪽이 그 의사의 하루 캘린더가 된다', async () => {
  const user = userEvent.setup()
  renderShell()
  await openReserveAndPickPatient(user)
  await user.click(screen.getByRole('button', { name: /이정훈/ }))

  expect(screen.getByText('시간을 고르는 중')).toBeVisible()
})

test('[PANEL-WORK-01][PANEL-WORK-03] 날짜 칸을 누르면 왼쪽이 달력이 되고 무엇을 고르는 중인지 적힌다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '예약' }))
  await user.click(screen.getByRole('button', { name: /날짜를 고르세요/ }))

  expect(screen.getByText('날짜를 고르는 중')).toBeVisible()
})

test('[PANEL-ONE-01] 소비 화면이 패널을 열면 열려 있던 문이 자리를 비운다', async () => {
  const user = userEvent.setup()
  renderShell()
  await user.click(screen.getByRole('button', { name: '예약' }))
  await user.click(screen.getByRole('button', { name: '접기' })) // 왼쪽 도구를 걷어 소비 화면으로 돌아간다
  await user.click(screen.getByRole('button', { name: '예약 블록' }))

  expect(openPanels()).toHaveLength(1)
  expect(screen.queryByRole('complementary', { name: '새 예약' })).toBeNull()
  expect(screen.getByText('예약 상세')).toBeVisible()
})
