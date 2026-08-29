import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { server } from '../../test/msw/server'
import { PanelHost, PanelProvider } from '../../components/PanelHost'
import type { Role } from '../../auth/roles'
import { installMemoryStorage } from './testStorage'
import { DoctorConsolePage } from './DoctorConsolePage'
import { resize, DEFAULT_WIDTHS } from './ColumnResizer'

// jsdom엔 scrollIntoView가 없다 — InlineError가 스크롤하려다 죽지 않게 스텁한다.
Element.prototype.scrollIntoView = vi.fn()

let currentRole: Role = 'doctor'
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ staff: { staffId: 'me', name: '박지훈', email: 'x@y.z', role: currentRole, departmentId: null, departmentName: null } }),
}))

interface QueueOpts {
  rows?: unknown[]
  mode?: 'live' | 'read_only_with_record_edit'
  record?: Record<string, unknown> | null
  history?: unknown[]
  onPatch?: () => void
}

function mockConsole(opts: QueueOpts = {}) {
  server.use(
    http.get('*/doctors/console/patients/:id/history', () =>
      HttpResponse.json({ rows: opts.history ?? [] }),
    ),
    http.get('*/doctors/:id/queue', () =>
      HttpResponse.json({ rows: opts.rows ?? [], mode: opts.mode ?? 'live' }),
    ),
    http.get('*/medical-records/by-appointment/:id', () => HttpResponse.json(opts.record ?? null)),
    http.get('*/medical-records/:id/revisions', () => HttpResponse.json([])),
    http.get('*/appointments/:id/questionnaire', () => HttpResponse.json({ questionnaire: null })),
    http.get('*/patients/:id/notes', () => HttpResponse.json([])),
    http.get('*/doctor/quick-phrases', () => HttpResponse.json([])),
    http.patch('*/appointments/:id/status', () => {
      opts.onPatch?.()
      return HttpResponse.json({ status: 'updated' })
    }),
  )
}

function renderConsole() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PanelProvider>
        <MemoryRouter initialEntries={['/doctor/console']}>
          <Routes>
            <Route path="/doctor/console" element={<DoctorConsolePage />} />
            <Route path="/today" element={<div data-testid="today" />} />
          </Routes>
        </MemoryRouter>
        <PanelHost />
      </PanelProvider>
    </QueryClientProvider>,
  )
}

const WAITING_ROW = {
  id: 'a1', patient_id: 'p1', name: '김*자', queue_position: 1,
  waiting_started_at: null, status: '진료대기', updated_at: '2026-08-15T09:00:00+09:00',
}

describe('DoctorConsolePage', () => {
  beforeEach(() => {
    currentRole = 'doctor'
    installMemoryStorage()
    localStorage.clear()
  })
  afterEach(() => vi.clearAllMocks())

  test('[DOCTOR-SHELL-02][SHELL-URL-01] 의사가 아니면 화면에서도 막고 갈 길을 준다', async () => {
    currentRole = 'receptionist'
    mockConsole()
    renderConsole()
    expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeVisible()
    expect(screen.getByRole('button', { name: /오늘의 현황/ })).toBeVisible() // 막다른 길 금지
  })

  test('[DOCTOR-SHELL-03][SHELL-ACT-03] 의사 화면에 예약·당일 방문 버튼을 그리지 않는다', async () => {
    mockConsole({ rows: [] })
    renderConsole()
    await screen.findByText('오늘 진료 대기 환자가 없습니다')
    expect(screen.queryByRole('button', { name: /새 예약|당일 방문|＋ 접수/ })).toBeNull()
  })

  test('3단 패널(대기·환자 맥락·기록)이 함께 있다', async () => {
    mockConsole({ rows: [] })
    renderConsole()
    expect(await screen.findByRole('region', { name: '오늘 진료 대기' })).toBeVisible()
    expect(screen.getByRole('region', { name: '현재 환자' })).toBeVisible()
    expect(screen.getByText(/왼쪽에서 진료할 환자를 골라/)).toBeVisible()
  })

  test('[DOCTOR-LOAD-01][EMPTY-LAY-01] 처음엔 대기 열에 자리 표시자를 그린다', () => {
    mockConsole({ rows: [] })
    renderConsole()
    expect(screen.getByTestId('skeleton')).toBeVisible() // 흰 빈 화면을 만들지 않는다
  })

  test('[DOCTOR-QUEUE-04][DOCTOR-START-01] 진료대기 행을 열면 진료중 전이를 서버에 요청한다', async () => {
    const user = userEvent.setup()
    const onPatch = vi.fn()
    mockConsole({ rows: [WAITING_ROW], onPatch })
    renderConsole()
    await user.click(await screen.findByRole('button', { name: /진료대기/ }))
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1)) // 여는 행위가 곧 전이
  })

  test('[DOCTOR-HISTORY-01] 환자를 열면 완료된 과거 진료기록을 채워 보인다(하드코딩 빈 상태 아님)', async () => {
    const user = userEvent.setup()
    mockConsole({
      rows: [WAITING_ROW],
      history: [
        { id: 'r1', date: '2026-07-30', department_name: '내과', doctor_name: '이정민', diagnosis: '고혈압 경과 관찰', status: '진료완료' },
      ],
    })
    renderConsole()
    await user.click(await screen.findByRole('button', { name: /진료대기/ }))
    const history = await screen.findByRole('region', { name: '과거 진료기록' })
    expect(await within(history).findByText('고혈압 경과 관찰')).toBeVisible()
    expect(within(history).getByText(/내과 · 이정민/)).toBeVisible()
    // 하드코딩 빈 상태였다면 이 안내가 떴을 것 — 실제 기록을 받으면 안 뜬다.
    expect(within(history).queryByText('완료된 과거 진료기록이 없습니다')).toBeNull()
  })

  test('[DOCTOR-CONTEXT-01][MASK-DETAIL-01] 선택해도 전화번호를 끌어오지 않는다', async () => {
    const user = userEvent.setup()
    mockConsole({ rows: [WAITING_ROW] })
    renderConsole()
    await user.click(await screen.findByRole('button', { name: /진료대기/ }))
    await waitFor(() => expect(screen.getByRole('region', { name: '진료기록 작성' })).toBeVisible())
    expect(screen.queryByText(/010-/)).toBeNull()
  })

  test('[DOCTOR-SHELL-04][AD-062] 열 폭은 범위 안에서만 움직이고 옆 열을 최소 아래로 안 민다', () => {
    // 대기 200~320(기본 230). 왼쪽 경계를 세게 당겨도 최소에서 멈추고 맥락은 280 이상.
    const next = resize(DEFAULT_WIDTHS, 0, -400)
    expect(next.queue).toBe(200)
    expect(next.context).toBeGreaterThanOrEqual(280)
  })

  test('[DOCTOR-SHELL-05] [기본값으로]가 있고, 눌러도 서버로 아무것도 보내지 않는다', async () => {
    const user = userEvent.setup()
    mockConsole({ rows: [] })
    renderConsole()
    const reset = await screen.findByRole('button', { name: '기본값으로' })
    // 누른 뒤 처리되지 않은 요청이 있으면 MSW가 에러를 던진다(onUnhandledRequest: 'error').
    await user.click(reset)
    expect(reset).toBeVisible()
  })
})
