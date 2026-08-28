import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { QueuePage, nowHHMM } from './QueuePage'
import type { QueueResponse, QueueRow } from '../api/dashboard'

// 백엔드 계약: backend/app/services/dashboard_service.py::get_queue (masked_* 화이트리스트).

function row(over: Partial<QueueRow> & Pick<QueueRow, 'appointment_id' | 'status'>): QueueRow {
  return {
    patient_id: `pat-${over.appointment_id}`,
    name: '홍*동',
    masked_birth_date: '1985-**-**',
    updated_at: '2026-08-26T01:00:00+00:00',
    is_urgent_flag: false,
    is_walkin: false,
    doctor_id: 'doc-a',
    doctor_name: '박지훈',
    department_name: '내과',
    slot_time: null,
    ...over,
  }
}

const COUNTS = { total: 7, not_arrived: 1, arrived: 1, waiting: 2, in_progress: 0, completed: 0, cancelled_or_noshow: 0 }

function queueOk(rowsByTab: Partial<Record<string, QueueRow[]>>) {
  server.use(http.get('*/queue', ({ request }) => {
    const tab = new URL(request.url).searchParams.get('tab') ?? 'waiting'
    const body: QueueResponse = { rows: rowsByTab[tab] ?? [], tab_counts: COUNTS }
    return HttpResponse.json(body)
  }))
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

function renderQueue(initial = '/queue') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[initial]}>
        <Routes>
          <Route path="/queue" element={<QueuePage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('QueuePage', () => {
  beforeEach(() => {
    queueOk({
      waiting: [
        row({ appointment_id: 'w1', status: '진료대기', queue_no: 1 }),
        row({ appointment_id: 'w2', status: '진료대기', queue_no: 3, doctor_id: 'doc-b', doctor_name: '이수진' }),
      ],
      not_arrived: [row({ appointment_id: 'n1', status: '예약확정', slot_time: '09:30:00' })],
      arrived: [row({ appointment_id: 'ar1', status: '도착', updated_at: '2026-08-26T02:00:00+00:00' })],
    })
  })

  test('QUEUE-TAB-06: 0명 탭도 숫자를 숨기지 않는다', async () => {
    renderQueue()
    await screen.findByTestId('queue-row-w1') // 데이터 로드 대기
    const inProgress = screen.getByRole('tab', { name: /진료 중/ })
    expect(within(inProgress).getByText('0')).toBeInTheDocument()
  })

  test('QUEUE-TAB-03: 기본 탭은 진료 대기이고 순번을 그린다', async () => {
    renderQueue()
    const waitingTab = await screen.findByRole('tab', { name: /진료 대기/ })
    expect(waitingTab).toHaveAttribute('aria-selected', 'true')
    const r = await screen.findByTestId('queue-row-w1')
    expect(within(r).getByText('번')).toBeInTheDocument() // queue_no 단위
    expect(within(r).getByText('1')).toBeInTheDocument()
  })

  test('QUEUE-TAB-07: 탭을 바꾸면 URL에 남는다', async () => {
    renderQueue()
    await userEvent.click(await screen.findByRole('tab', { name: /미도착/ }))
    await waitFor(() => expect(new URLSearchParams(window.location.search)).toBeTruthy())
    // 미도착 탭의 예약 시각 레일이 보인다(QUEUE-ORDER-02).
    expect(await screen.findByText('09:30')).toBeInTheDocument()
  })

  test('QUEUE-BTN-01: 미도착 줄은 [진료 대기]·[도착]·[번호 보기] 세 버튼', async () => {
    renderQueue('/queue?tab=not_arrived')
    const r = await screen.findByTestId('queue-row-n1')
    expect(within(r).getByRole('button', { name: '진료 대기' })).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: '도착' })).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: '번호 보기' })).toBeInTheDocument()
  })

  test('QUEUE-ARRIVE-03(C): [도착]은 예약확정→도착 전이를 보낸다', async () => {
    let body: any = null
    server.use(http.patch('*/appointments/n1/status', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ status: 'updated' })
    }))
    renderQueue('/queue?tab=not_arrived')
    await userEvent.click(within(await screen.findByTestId('queue-row-n1')).getByRole('button', { name: '도착' }))
    await waitFor(() => expect(body).not.toBeNull())
    expect(body.new_status).toBe('도착')
    expect(body.expected_updated_at).toBe('2026-08-26T01:00:00+00:00')
  })

  test('QUEUE-BTN-03: 진료 대기 줄엔 상태를 바꾸는 버튼이 없다(진료 시작 없음)', async () => {
    renderQueue('/queue?tab=waiting')
    const r = await screen.findByTestId('queue-row-w1')
    expect(within(r).queryByRole('button', { name: '진료 시작' })).toBeNull()
    expect(within(r).getByRole('button', { name: '응급/주의 표시' })).toBeInTheDocument()
  })

  test('QUEUE-URG-03: 응급 표시 확인창에 「의학적 판정이 아니다」를 띄운다', async () => {
    renderQueue('/queue?tab=waiting')
    await userEvent.click(within(await screen.findByTestId('queue-row-w1')).getByRole('button', { name: '응급/주의 표시' }))
    expect(await screen.findByText(/의학적 응급도 판정이 아닙니다/)).toBeInTheDocument()
    expect(screen.getByText(/대기 순서는 바뀌지 않습니다/)).toBeInTheDocument()
  })

  test('QUEUE-ORDER-06: 순서 변경 사유가 비면 확인이 눌리지 않는다', async () => {
    renderQueue('/queue?tab=waiting')
    await userEvent.click(within(await screen.findByTestId('queue-row-w1')).getByRole('button', { name: '대기 순서 변경' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '확인' })).toBeDisabled()
  })

  test('QUEUE-FILT-03: 의사 필터는 화면에서 걸러도 탭 숫자는 전체 기준을 유지한다', async () => {
    renderQueue('/queue?tab=waiting')
    await screen.findByTestId('queue-row-w1')
    await userEvent.selectOptions(screen.getByLabelText('의사 필터'), 'doc-b')
    // doc-a 줄은 사라지고 doc-b 줄만 남는다.
    expect(screen.queryByTestId('queue-row-w1')).toBeNull()
    expect(screen.getByTestId('queue-row-w2')).toBeInTheDocument()
    // 탭 숫자(진료 대기 2)는 그대로다.
    const waitingTab = screen.getByRole('tab', { name: /진료 대기/ })
    expect(within(waitingTab).getByText('2')).toBeInTheDocument()
  })

  test('QUEUE-WALK-12: 워크인 줄엔 당일 방문 배지가 붙는다', async () => {
    queueOk({ waiting: [row({ appointment_id: 'w1', status: '진료대기', queue_no: 1, is_walkin: true })] })
    renderQueue('/queue?tab=waiting')
    const r = await screen.findByTestId('queue-row-w1')
    expect(within(r).getByText('당일 방문')).toBeInTheDocument()
  })
})

// [TIME-TZ-01] 「지금」은 병원 시계다 — 창구 PC 시계가 아니다.
test('[QUEUE-ARRIVE-02] 지금 시각을 병원 시계로 읽는다', () => {
  // KST 2026-08-29 01:20 = UTC 2026-08-28 16:20. 기계가 미 서부여도 01:20이다.
  expect(nowHHMM(new Date('2026-08-28T16:20:00Z'))).toBe('01:20')
})
