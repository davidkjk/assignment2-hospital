import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { server } from '../../test/msw/server'
import { PanelProvider, PanelHost } from '../../components/PanelHost'
import { MessagesPage } from './MessagesPage'
import type { MessagesView, ScheduledRow, SentRow } from '../../api/messages'

function scheduled(over: Partial<ScheduledRow> = {}): ScheduledRow {
  return {
    id: over.id ?? 's1',
    kind: over.kind ?? 'transactional',
    body: over.body ?? '예약 안내',
    channel: over.channel ?? 'push',
    scheduled_at: over.scheduled_at ?? '2026-09-10T09:05:00+09:00',
    target_count: over.target_count ?? 12,
    status: over.status ?? 'pending',
  }
}

function sent(over: Partial<SentRow> = {}): SentRow {
  return {
    id: over.id ?? 'm1',
    kind: over.kind ?? 'transactional',
    body: over.body ?? '손으로 보냄',
    channel: over.channel ?? 'push',
    requested_channel: over.requested_channel ?? 'push',
    sender_staff_id: over.sender_staff_id ?? 'staff-1',
    target_count: over.target_count ?? 3,
    sent_at: over.sent_at ?? '2026-09-01T10:00:00+09:00',
    result: over.result ?? { 발송중: 0, 도달: 3, 재시도중: 0, 실패: 0 },
  }
}

function view(over: Partial<MessagesView> = {}): MessagesView {
  return {
    scheduled: over.scheduled ?? [],
    sent: over.sent ?? { rows: [sent()], has_more: false, next_cursor: null, order: ['sent_at desc', 'id desc'] },
    auto_count: over.auto_count ?? 0,
  }
}

let deletedId = ''

function okWith(v: MessagesView) {
  server.use(
    http.get('*/messages', () => HttpResponse.json(v)),
    http.delete('*/messages/scheduled/:id', ({ params }) => {
      deletedId = String(params.id)
      return HttpResponse.json({ status: 'cancelled' })
    }),
  )
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PanelProvider>
          <MessagesPage />
          <PanelHost />
        </PanelProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  deletedId = ''
})

test('[SEND-LIST-01] 예약해 둔 것이 있으면 두 구역이 모두 보인다', async () => {
  okWith(view({ scheduled: [scheduled()] }))
  renderPage()
  expect(await screen.findByText('예약해 둔 것')).toBeVisible()
  expect(screen.getByText('안내 발송 이력')).toBeVisible()
})

test('[SEND-LIST-02] 예약이 0건이면 예약 구역이 사라진다', async () => {
  okWith(view({ scheduled: [] }))
  renderPage()
  expect(await screen.findByText('안내 발송 이력')).toBeVisible()
  expect(screen.queryByText('예약해 둔 것')).toBeNull()
})

test('[SEND-LIST-06] 보낸 줄은 일곱 칸이다', async () => {
  okWith(view({ sent: { rows: [sent()], has_more: false, next_cursor: null, order: [] } }))
  renderPage()
  await screen.findByText('안내 발송 이력')
  const headers = screen.getAllByRole('columnheader').map((th) => th.textContent)
  expect(headers).toEqual(['종류', '내용', '보낸 직원', '채널', '시각', '대상 수', '발송 결과'])
})

test('[SEND-LIST-08] 자동 발송은 「자동 발송 N건 보기」로 접힌다', async () => {
  okWith(view({ auto_count: 41 }))
  renderPage()
  expect(await screen.findByRole('button', { name: /자동 발송 41건 보기/ })).toBeVisible()
})

test('[SEND-LIST-08] 자동 발송이 0건이면 접기 버튼이 없다', async () => {
  okWith(view({ auto_count: 0 }))
  renderPage()
  await screen.findByText('안내 발송 이력')
  expect(screen.queryByRole('button', { name: /자동 발송/ })).toBeNull()
})

test('[MSGX-SCHED-02][SEND-LATER-05] 예약 줄 [취소]는 확인창을 거쳐 예약을 취소한다', async () => {
  const user = userEvent.setup()
  okWith(view({ scheduled: [scheduled({ id: 's7' })] }))
  renderPage()
  await screen.findByText('예약해 둔 것')
  await user.click(screen.getByRole('button', { name: '취소' }))
  const dialog = screen.getByRole('dialog')
  expect(dialog).toBeVisible()
  await user.click(within(dialog).getByRole('button', { name: '예약 취소' }))
  await waitFor(() => expect(deletedId).toBe('s7'))
})

test('[SEND-DOOR-03][SEND-BOX-03][손검수 ⑤] [＋ 새로 보내기]는 본화면 2단 작성으로 넘어간다', async () => {
  const user = userEvent.setup()
  okWith(view({ scheduled: [] }))
  renderPage()
  await screen.findByText('안내 발송 이력')
  await user.click(screen.getByRole('button', { name: /새로 보내기/ }))
  // 옛 오른쪽 320px 패널(complementary)이 아니라, 왼쪽 「받는 사람」 / 오른쪽 「보내는 내용」 2단.
  expect(await screen.findByRole('region', { name: '받는 사람 고르기' })).toBeVisible()
  expect(screen.getByRole('region', { name: '보내는 내용' })).toBeVisible()
  expect(screen.getByRole('button', { name: '← 목록으로' })).toBeVisible()
})

test('[SEND-RESULT-14] 전부 도달이면 「도달 N건」만, 「실패 0건」은 안 적는다', async () => {
  okWith(
    view({
      sent: {
        rows: [sent({ result: { 발송중: 0, 도달: 34, 재시도중: 0, 실패: 0 } })],
        has_more: false,
        next_cursor: null,
        order: [],
      },
    }),
  )
  renderPage()
  expect(await screen.findByText('도달 34건')).toBeVisible()
  expect(screen.queryByText(/실패 0건/)).toBeNull()
})

test('[SEND-RESULT-13] 실패가 있으면 「안 닿은 N명 보기」가 뜨고 실패 명단 패널을 연다', async () => {
  const user = userEvent.setup()
  server.use(
    http.get('*/messages/:id/failed', () =>
      HttpResponse.json({
        call_now: [
          {
            id: 'n1',
            patient_id: 'p1',
            name: '김환자',
            phone: '010-****-1234',
            failure_code: 'blocked',
            notification_type: 'staff_direct',
            already_known: false,
          },
        ],
        fix_number: [],
      }),
    ),
  )
  okWith(
    view({
      sent: {
        rows: [sent({ result: { 발송중: 0, 도달: 32, 재시도중: 0, 실패: 2 } })],
        has_more: false,
        next_cursor: null,
        order: [],
      },
    }),
  )
  renderPage()
  await user.click(await screen.findByRole('button', { name: '안 닿은 2명 보기' }))
  expect(await screen.findByText('김환자')).toBeVisible()
})

test('[SEND-RESULT-11] 발송 직후엔 「발송 중」으로 보인다', async () => {
  okWith(
    view({
      sent: {
        rows: [sent({ channel: 'sms', result: { 발송중: 34, 도달: 0, 재시도중: 0, 실패: 0 } })],
        has_more: false,
        next_cursor: null,
        order: [],
      },
    }),
  )
  renderPage()
  expect(await screen.findByText(/문자 34건 발송 중/)).toBeVisible()
})
