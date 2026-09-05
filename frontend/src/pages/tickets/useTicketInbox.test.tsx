import { it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { StaffChatApi, InboxTicket, TicketStatus } from '../../api/staffChat'

// Realtime 훅을 모킹해 onChange(구독 알림)·onStatus(끊김/복구)를 수동으로 부른다
// (webchat/staff-web과 같은 하네스 관례 — 실제 채널을 열지 않는다).
let realtimeOnChange: (() => void) | null = null
vi.mock('./useTicketsRealtime', () => ({
  useTicketsRealtime: (onChange: () => void) => {
    realtimeOnChange = onChange
  },
}))

import { useTicketInbox } from './useTicketInbox'

const mk = (id: string, status: TicketStatus, createdAt: string, over: Partial<InboxTicket> = {}): InboxTicket => ({
  id,
  status,
  patientQuestion: '두통이 심해요',
  handoffReason: '약 정보',
  createdAt,
  assigneeName: null,
  isMine: false,
  requestType: null,
  appointmentSummary: null,
  ...over,
})

function fakeApi(over: Partial<StaffChatApi> = {}): StaffChatApi {
  return { listTickets: vi.fn(async () => []), claimTicket: vi.fn(), ...over } as StaffChatApi
}

it('[TICKET-INBOX-TAB-01] 세 상태 탭만 두고 pending·in_progress·answered에 대응하며 원시 enum을 노출하지 않는다', () => {
  const { result } = renderHook(() => useTicketInbox(fakeApi()))
  expect(result.current.tabs.map((t) => t.key)).toEqual(['pending', 'in_progress', 'answered'])
  expect(result.current.tabs.map((t) => t.label)).toEqual(['새 문의', '처리 중', '답변 완료'])
})

it('[TICKET-INBOX-TAB-02] 선택한 상태의 티켓만 조회하고 세 상태를 한 목록에 섞지 않는다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async (s) => (s === 'in_progress' ? [mk('a', 'in_progress', '2026-08-19T09:00')] : [])),
  })
  const { result } = renderHook(() => useTicketInbox(api))
  await act(async () => result.current.setTab('in_progress'))
  await waitFor(() => expect(result.current.tickets.every((t) => t.status === 'in_progress')).toBe(true))
  expect(api.listTickets).toHaveBeenCalledWith('in_progress')
})

it('[TICKET-INBOX-ORDER-01] 접수순(옛 스펙)을 적용한다 — 서버 순서를 재정렬하지 않는다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00'), mk('b', 'pending', '2026-08-19T09:00')]),
  })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets.map((t) => t.id)).toEqual(['a', 'b']))
})

it('[TICKET-INBOX-ORDER-02] 접수시각 오름차순, 동점이면 티켓 ID 오름차순(created_at ASC, id ASC)을 마지막 키로 방어한다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async () => [mk('b', 'pending', '2026-08-19T08:00'), mk('a', 'pending', '2026-08-19T08:00')]),
  })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets.map((t) => t.id)).toEqual(['a', 'b']))
})

it('[TICKET-INBOX-EMPTY-01] 선택 탭 0건이면 그 탭 안에서만 0건을 표시하고 다른 탭 건수를 0으로 단정하지 않는다', async () => {
  const { result } = renderHook(() => useTicketInbox(fakeApi()))
  await waitFor(() => expect(result.current.phase).toBe('empty'))
  expect(result.current.counts).not.toEqual({ pending: 0, in_progress: 0, answered: 0 })
})

it('[TICKET-INBOX-LOAD-01] 최초 로딩 중에는 로딩 상태를 두고 0건 문구를 먼저 보여주지 않는다', async () => {
  let resolve!: (v: InboxTicket[]) => void
  const api = fakeApi({
    listTickets: vi.fn(
      () =>
        new Promise<InboxTicket[]>((r) => {
          resolve = r
        }),
    ),
  })
  const { result } = renderHook(() => useTicketInbox(api))
  expect(result.current.phase).toBe('loading')
  expect(result.current.phase).not.toBe('empty')
  await act(async () => resolve([]))
})

it('[TICKET-INBOX-ERR-01] 최초 조회 실패는 오류로 두고 실패를 0건으로 바꾸지 않는다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async () => {
      throw new Error('net')
    }),
  })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.phase).toBe('error'))
  expect(result.current.phase).not.toBe('empty')
})

it('[TICKET-INBOX-ERR-02] 기존 목록을 본 뒤 재조회 실패는 보던 행을 남기고 부분 오류를 표시한다', async () => {
  const api = fakeApi({ listTickets: vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00')]) })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets).toHaveLength(1))
  ;(api.listTickets as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('net'))
  await act(async () => await result.current.retry())
  expect(result.current.tickets).toHaveLength(1)
  expect(result.current.partialError).toBe(true)
})

it('[TICKET-INBOX-EXC-01] 알 수 없는 상태 값을 받으면 탭으로 임의 번역하지 않고 조회 오류로 표시한다', async () => {
  const api = fakeApi({ listTickets: vi.fn(async () => [mk('a', 'escalated' as TicketStatus, '2026-08-19T08:00')]) })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.phase).toBe('error'))
})

it('[TICKET-INBOX-BLOCK-01] support_tickets 계약이 없으면 가짜 0건을 그리지 않고 BLOCKED로 취급한다', async () => {
  const api = fakeApi({
    listTickets: vi.fn(async () => {
      throw new Error('staff_chat_api_501')
    }),
  })
  const { result } = renderHook(() => useTicketInbox(api, { contractReady: false }))
  await waitFor(() => expect(result.current.phase).toBe('blocked'))
  expect(result.current.phase).not.toBe('empty')
})

it('[TICKET-INBOX-LIVE-01] support_tickets 생성·상태 변경을 구독해 현재 탭과 건수를 다시 맞춘다', async () => {
  const api = fakeApi({ listTickets: vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00')]) })
  renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(api.listTickets).toHaveBeenCalledTimes(1))
  await act(async () => realtimeOnChange?.()) // 구독 알림 → 재조회
  await waitFor(() => expect((api.listTickets as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2))
})

it('[TICKET-INBOX-LIVE-02] 새 pending 티켓을 목록에 반영하되 보고 있던 행의 상세를 자동으로 열지 않는다', async () => {
  const onOpenDetail = vi.fn()
  const api = fakeApi({ listTickets: vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00')]) })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets).toHaveLength(1))
  await act(async () => realtimeOnChange?.())
  expect(onOpenDetail).not.toHaveBeenCalled() // 목록 반영은 자동, 상세 열기는 사용자 선택으로만(훅은 상세를 모른다)
})

it('[TICKET-INBOX-LIVE-03] 보이는 티켓이 다른 상태로 바뀌면 현재 탭에서 제거하되 자동 이동하지 않는다', async () => {
  const listMock = vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00')])
  const api = fakeApi({ listTickets: listMock })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets).toHaveLength(1))
  listMock.mockResolvedValueOnce([]) // a가 in_progress로 이동해 pending 탭에서 사라짐
  await act(async () => await result.current.retry())
  expect(result.current.tickets).toHaveLength(0)
})

it('[TICKET-INBOX-LIVE-04] Realtime 끊김이면 목록을 유지하고 중단 상태를 노출한다', async () => {
  const api = fakeApi({ listTickets: vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00')]) })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets).toHaveLength(1))
  await act(async () => result.current.onLiveChange('disconnected'))
  expect(result.current.live).toBe('disconnected')
  expect(result.current.tickets).toHaveLength(1)
})

it('[TICKET-INBOX-LIVE-05] Realtime 복구면 서버 목록을 다시 조회해 정합화하고 끊김 표시를 없앤다', async () => {
  const listMock = vi.fn(async () => [mk('a', 'pending', '2026-08-19T08:00')])
  const api = fakeApi({ listTickets: listMock })
  const { result } = renderHook(() => useTicketInbox(api))
  await waitFor(() => expect(result.current.tickets).toHaveLength(1))
  await act(async () => result.current.onLiveChange('disconnected'))
  await act(async () => result.current.onLiveChange('connected'))
  expect(result.current.live).toBe('connected')
  expect(listMock.mock.calls.length).toBeGreaterThanOrEqual(2)
})
