import { it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { TicketClaimConflict } from '../../api/staffChat'
import { TicketNotFound, type StaffTicketDetailApi, type TicketDetail } from '../../api/staffChatDetail'

// 상세 라이브 훅을 모킹해 실제 채널을 열지 않는다(문의함 하네스와 동일). LIVE 규칙은 훅 메서드를 직접 불러 검증한다.
vi.mock('./useTicketDetailRealtime', () => ({
  useTicketDetailRealtime: () => {},
}))

import { useTicketDetail } from './useTicketDetail'

const mkDetail = (over: Partial<TicketDetail> = {}): TicketDetail => ({
  id: 't1',
  status: 'in_progress',
  reason: 'general',
  assignee: { name: '나', role: 'reception' },
  isMine: true,
  summary: { patientAsked: '두통약 정보', botConfirmed: null, alreadyGuided: null, unresolvedReason: null, staffShouldCheck: null },
  messages: [],
  contact: { anonymous: false, hasPhone: false },
  ...over,
})

function fakeApi(over: Partial<StaffTicketDetailApi> = {}): StaffTicketDetailApi {
  return {
    getDetail: vi.fn(async () => mkDetail()),
    claim: vi.fn(async () => mkDetail()),
    sendMessage: vi.fn(),
    closeTicket: vi.fn(),
    reassignTicket: vi.fn(),
    markRead: vi.fn(async () => {}),
    listActiveStaff: vi.fn(async () => []),
    ...over,
  } as StaffTicketDetailApi
}

// ── Step 2: 열람/배정·상태·로딩·권한 ──────────────────────────────────────────
it('[TICKET-DETAIL-OPEN-01] pending·미배정 티켓을 열면 상세 조회와 함께 in_progress로 자동 전환하고 연 직원을 배정한다', async () => {
  const claim = vi.fn(async () => mkDetail({ status: 'in_progress', isMine: true }))
  const api = fakeApi({ getDetail: vi.fn(async () => mkDetail({ status: 'pending', isMine: false, assignee: null })), claim })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(claim).toHaveBeenCalledWith('t1'))
  await waitFor(() => expect(result.current.detail?.status).toBe('in_progress'))
})

it('[TICKET-DETAIL-OPEN-02] 두 직원이 같은 pending을 거의 동시에 열면 늦은 직원은 상세를 열지 않고 목록으로 돌아가 안내를 받는다', async () => {
  const onLoser = vi.fn()
  const api = fakeApi({
    getDetail: vi.fn(async () => mkDetail({ status: 'pending', isMine: false, assignee: null })),
    claim: vi.fn(async () => {
      throw new TicketClaimConflict('이미 다른 직원이 맡았어요.')
    }),
  })
  const { result } = renderHook(() => useTicketDetail(api, 't1', { onLoserBackToList: onLoser }))
  await waitFor(() => expect(onLoser).toHaveBeenCalledWith('이미 다른 직원이 맡았어요.'))
  expect(result.current.phase).not.toBe('ready')
})

it('[TICKET-DETAIL-OPEN-03] 남의 in_progress는 목록으로 돌려보내고, answered는 읽기 전용으로 열되 재개하지 않는다', async () => {
  const onLoser = vi.fn()
  const others = fakeApi({ getDetail: vi.fn(async () => mkDetail({ status: 'in_progress', isMine: false, assignee: { name: '김직원', role: 'reception' } })) })
  renderHook(() => useTicketDetail(others, 't1', { onLoserBackToList: onLoser }))
  await waitFor(() => expect(onLoser).toHaveBeenCalled())
  const answered = fakeApi({ getDetail: vi.fn(async () => mkDetail({ status: 'answered', isMine: true })) })
  const { result } = renderHook(() => useTicketDetail(answered, 't2'))
  await waitFor(() => expect(result.current.phase).toBe('ready'))
  expect(result.current.isReadOnly).toBe(true)
  expect(answered.claim).not.toHaveBeenCalled()
})

it('[TICKET-DETAIL-STATUS-01] pending=직원 연결 중, in_progress=직원 상담 중, answered=상담 종료로 표시한다', async () => {
  const api = fakeApi({ getDetail: vi.fn(async () => mkDetail({ status: 'answered', isMine: true })) })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(result.current.statusLabel).toBe('상담 종료'))
})

it('[TICKET-DETAIL-STATUS-02] 창을 닫거나 화면을 벗어나는 것만으로 진행 중 상담을 종료하지 않는다(unmount가 close를 부르지 않음)', async () => {
  const api = fakeApi()
  const { unmount } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(api.getDetail).toHaveBeenCalled())
  unmount()
  expect(api.closeTicket).not.toHaveBeenCalled()
})

it('[TICKET-DETAIL-STATUS-03] AI 30분 무활동 만료를 직원 상담에 적용하지 않는다(만료 타이머로 answered로 바꾸지 않음)', async () => {
  vi.useFakeTimers()
  const api = fakeApi()
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await act(async () => {
    await Promise.resolve()
  })
  act(() => vi.advanceTimersByTime(31 * 60 * 1000))
  expect(result.current.detail?.status).not.toBe('answered')
  expect(api.closeTicket).not.toHaveBeenCalled()
  vi.useRealTimers()
})

it('[TICKET-DETAIL-LOAD-01] 응답 대기 중에는 로딩을 두고 자동 배정 성공 전 처리 중이라고 단정하지 않는다', async () => {
  let resolve!: (d: TicketDetail) => void
  const api = fakeApi({ getDetail: vi.fn(() => new Promise<TicketDetail>((r) => (resolve = r))) })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  expect(result.current.phase).toBe('loading')
  expect(result.current.statusLabel).not.toBe('직원 상담 중')
  await act(async () => resolve(mkDetail()))
})

it('[TICKET-DETAIL-ERR-02] 없는·권한 없는 티켓(404/403)은 내용을 노출하지 않고 목록으로 돌아갈 경로를 준다', async () => {
  const api = fakeApi({
    getDetail: vi.fn(async () => {
      throw new TicketNotFound('x')
    }),
  })
  const { result } = renderHook(() => useTicketDetail(api, 'gone'))
  await waitFor(() => expect(result.current.phase).toBe('notfound'))
  expect(result.current.detail).toBeNull()
})

// ── Step 5: 라이브 ─────────────────────────────────────────────────────────────
it('[TICKET-DETAIL-LIVE-01] 같은 chat_messages의 새 메시지를 원본 대화에 즉시 반영한다', async () => {
  const first = mkDetail({ messages: [] })
  const withMsg = mkDetail({
    messages: [{ id: 'm1', sender: 'patient', body: '추가 질문', at: '09:20', patientRead: false, staffUnread: true, smsSent: false }],
  })
  const getDetail = vi.fn<() => Promise<TicketDetail>>().mockResolvedValueOnce(first).mockResolvedValue(withMsg)
  const api = fakeApi({ getDetail })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(result.current.detail).not.toBeNull())
  await act(async () => {
    await result.current.reloadConversation()
  })
  expect(result.current.detail?.messages).toHaveLength(1)
})

it('[TICKET-DETAIL-LIVE-02] 다른 직원의 배정·이관·종료·전송은 화면을 이동시키지 않고 담당자·상태만 최신 값으로 바꾼다', async () => {
  const before = mkDetail({ status: 'in_progress' })
  const after = mkDetail({ status: 'answered' })
  const getDetail = vi.fn<() => Promise<TicketDetail>>().mockResolvedValueOnce(before).mockResolvedValue(after)
  const api = fakeApi({ getDetail })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(result.current.detail?.status).toBe('in_progress'))
  await act(async () => {
    await result.current.onLiveChange('connected')
  })
  expect(result.current.detail?.status).toBe('answered')
})

it('[TICKET-DETAIL-LIVE-03] Realtime 끊김이면 대화·입력값을 유지하고 전송·종료 결과를 성공으로 추측하지 않는다', async () => {
  const api = fakeApi()
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(result.current.detail).not.toBeNull())
  await act(async () => {
    await result.current.onLiveChange('disconnected')
  })
  expect(result.current.live).toBe('disconnected')
  expect(result.current.detail).not.toBeNull()
})

it('[TICKET-DETAIL-LIVE-04] Realtime 복구면 서버에서 대화·상태·담당자를 다시 조회해 누락·중복을 정합화한다', async () => {
  const getDetail = vi.fn(async () => mkDetail())
  const api = fakeApi({ getDetail })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(getDetail).toHaveBeenCalledTimes(1))
  await act(async () => {
    await result.current.onLiveChange('disconnected')
  })
  await act(async () => {
    await result.current.onLiveChange('connected')
  })
  expect(getDetail.mock.calls.length).toBeGreaterThanOrEqual(2)
})

it('[TICKET-DETAIL-TYPING-01] 답변 작성 중이면 입력 중 신호를 보내고 유휴 3초면 해제한다(디바운스)', async () => {
  vi.useFakeTimers()
  const api = fakeApi()
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await act(async () => {
    await Promise.resolve()
  })
  const emit = vi.fn()
  act(() => result.current.setTyping(emit))
  expect(emit).toHaveBeenLastCalledWith(true)
  act(() => vi.advanceTimersByTime(3000))
  expect(emit).toHaveBeenLastCalledWith(false)
  vi.useRealTimers()
})

// ── Step 6: 미확인/읽음(UNREAD-02) ────────────────────────────────────────────
it('[TICKET-DETAIL-UNREAD-02] 직원이 상세를 열어 미확인 메시지를 보면 서버 확인 상태를 갱신하고 미확인 표시를 해소한다', async () => {
  const markRead = vi.fn(async () => {})
  const detail = mkDetail({ messages: [{ id: '1', sender: 'patient', body: 'x', at: '09:00', patientRead: false, staffUnread: true, smsSent: false }] })
  const api = fakeApi({ getDetail: vi.fn(async () => detail), markRead })
  const { result } = renderHook(() => useTicketDetail(api, 't1'))
  await waitFor(() => expect(result.current.detail).not.toBeNull())
  await act(async () => {
    await result.current.markReadVisible()
  })
  expect(markRead).toHaveBeenCalledWith('t1', '1')
  expect(result.current.detail?.messages[0].staffUnread).toBe(false)
})
