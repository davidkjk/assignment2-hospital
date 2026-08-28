import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { server } from '../../test/msw/server'
import { PanelHost, PanelProvider } from '../../components/PanelHost'
import { installMemoryStorage } from './testStorage'
import { DoctorConsolePage } from './DoctorConsolePage'

Element.prototype.scrollIntoView = vi.fn()

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ staff: { staffId: 'me', name: '박지훈', email: 'x@y.z', role: 'doctor', departmentId: null, departmentName: null } }),
}))

// 오늘/어제/내일을 실제 시계로 계산한다(fake timer와 userEvent 충돌을 피한다).
function ymd(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY = ymd(0)
const TOMORROW = ymd(1)
const YESTERDAY = ymd(-1)

const PAST_ROW = {
  id: 'a9', patient_id: 'p9', name: '이*희', queue_position: null,
  waiting_started_at: null, status: '진료중', updated_at: '2026-08-10T09:00:00',
}

function mockConsole(record: Record<string, unknown> | null, onQueueUrl?: (url: string) => void) {
  server.use(
    http.get('*/doctors/:id/queue', ({ request }) => {
      onQueueUrl?.(request.url)
      return HttpResponse.json({
        rows: [PAST_ROW],
        mode: new URL(request.url).searchParams.has('date') ? 'read_only_with_record_edit' : 'live',
      })
    }),
    http.get('*/medical-records/by-appointment/:id', () => HttpResponse.json(record)),
    http.get('*/medical-records/:id/revisions', () => HttpResponse.json([])),
    http.get('*/appointments/:id/questionnaire', () => HttpResponse.json({ questionnaire: null })),
    http.get('*/patients/:id/notes', () => HttpResponse.json([])),
    http.get('*/doctor/quick-phrases', () => HttpResponse.json([])),
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
          </Routes>
        </MemoryRouter>
        <PanelHost />
      </PanelProvider>
    </QueryClientProvider>,
  )
}

const dateInput = () => screen.getByLabelText('진료 날짜') as HTMLInputElement

describe('DatePolicy', () => {
  beforeEach(() => {
    installMemoryStorage()
    localStorage.clear()
  })

  test('[DOCTOR-DATE-01] 오늘이 기본이고, 미래 날짜는 고를 수 없다', async () => {
    mockConsole(null)
    renderConsole()
    await waitFor(() => expect(dateInput().value).toBe(TODAY))
    expect(dateInput()).toHaveAttribute('max', TODAY)
    fireEvent.change(dateInput(), { target: { value: TOMORROW } })
    expect(dateInput().value).toBe(TODAY) // 미래는 걸리지 않는다
  })

  test('[DOCTOR-DATE-02] 과거 날짜로 바꾸면 그 날짜로 조회하고, 예약은 읽기 전용이 된다', async () => {
    const user = userEvent.setup()
    let lastUrl = ''
    mockConsole({ is_completed: false, symptoms: '기침' }, (u) => { lastUrl = u })
    renderConsole()
    await screen.findByRole('button', { name: /진료중/ })

    fireEvent.change(dateInput(), { target: { value: YESTERDAY } })
    await waitFor(() => expect(lastUrl).toContain(`date=${YESTERDAY}`))

    await user.click(await screen.findByRole('button', { name: /진료중/ }))
    await waitFor(() => expect(screen.getByLabelText('증상')).toHaveAttribute('readonly'))
  })

  test('[DOCTOR-DATE-05] 과거 미완료는 재개해 완료시키지 않고 오늘로 안내한다', async () => {
    const user = userEvent.setup()
    mockConsole({ is_completed: false })
    renderConsole()
    fireEvent.change(dateInput(), { target: { value: YESTERDAY } })
    await user.click(await screen.findByRole('button', { name: /진료중/ }))
    await waitFor(() => expect(screen.getByText(/오늘 「지금 처리할 것」에서 이어서/)).toBeVisible())
    expect(screen.queryByRole('button', { name: '진료 완료' })).toBeNull()
  })

  test('[DOCTOR-DATE-04][DOCTOR-RECORD-08] 과거 완료 기록은 사유를 넣어 고칠 수 있다', async () => {
    const user = userEvent.setup()
    mockConsole({ is_completed: true, id: 'rec-1', symptoms: '급성 위염', updated_at: '2026-08-10T10:00:00' })
    renderConsole()
    fireEvent.change(dateInput(), { target: { value: YESTERDAY } })
    await user.click(await screen.findByRole('button', { name: /진료중/ }))
    // 완료 기록엔 [수정]이 있고, 수정 폼엔 사유가 필수다
    await user.click(await screen.findByRole('button', { name: '수정' }))
    expect(screen.getByLabelText('수정 사유')).toBeRequired()
  })
})
