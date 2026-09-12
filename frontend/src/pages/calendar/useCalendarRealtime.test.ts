import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useCalendarRealtime } from './useCalendarRealtime'
import { supabase } from '../../lib/supabaseClient'

// 제어 가능한 채널 mock — .on에 넘어온 콜백을 잡아 두었다가 emit으로 부른다.
type Handler = (payload: unknown) => void
interface Bound { table: string; cb: Handler }
interface FakeChannel {
  handlers: Bound[]
  statusCb: ((status: string) => void) | null
  on(event: string, filter: { table: string }, cb: Handler): FakeChannel
  subscribe(cb?: (status: string) => void): FakeChannel
}

function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    handlers: [],
    statusCb: null,
    on(_event, filter, cb) {
      // 실제 Supabase처럼 테이블별로 걸어 둔다 — 그 테이블 변경에만 콜백이 온다.
      ch.handlers.push({ table: filter.table, cb })
      return ch
    },
    subscribe(cb) {
      ch.statusCb = cb ?? null
      cb?.('SUBSCRIBED')
      return ch
    },
  }
  return ch
}

let channel: FakeChannel

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  channel = makeChannel()
  ;(supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel)
})

function emit(payload: { table: string; eventType: string }) {
  for (const h of channel.handlers) if (h.table === payload.table) h.cb(payload)
}

test('[CAL-LIVE-01][SHELL-LIVE-02] 격자는 실시간으로 갱신되고 연결을 새로 열지 않는다', () => {
  const onChange = vi.fn()
  renderHook(() => useCalendarRealtime(onChange))
  // 탭 하나당 채널 하나 — 여러 번 열지 않는다.
  expect(supabase.channel).toHaveBeenCalledTimes(1)
  act(() => emit({ eventType: 'INSERT', table: 'appointments' }))
  expect(onChange).toHaveBeenCalled()
})

test('[CAL-LIVE-02] 패널이 열려 있어도 갱신은 계속된다 — 훅은 화면 상태를 보지 않는다', () => {
  const onChange = vi.fn()
  renderHook(() => useCalendarRealtime(onChange))
  act(() => emit({ eventType: 'UPDATE', table: 'appointments' }))
  expect(onChange).toHaveBeenCalledTimes(1)
})

test('[SUPPORT-CAL-LIVE-01] 상담 요청 변경도 같은 채널로 온다', () => {
  const onChange = vi.fn()
  renderHook(() => useCalendarRealtime(onChange))
  act(() => emit({ eventType: 'INSERT', table: 'support_requests' }))
  expect(onChange).toHaveBeenCalled()
})

test('[CAL-LIVE-03] 연결이 끊기면 기준 시각(staleSince)이 생긴다', () => {
  const onChange = vi.fn()
  const { result } = renderHook(() => useCalendarRealtime(onChange))
  expect(result.current.staleSince).toBeNull()
  act(() => channel.statusCb?.('CHANNEL_ERROR'))
  expect(result.current.staleSince).toBeInstanceOf(Date)
})

test('[SUPPORT-CAL-LIVE-04] 다시 연결되면 기준 시각이 사라진다', () => {
  const onChange = vi.fn()
  const { result } = renderHook(() => useCalendarRealtime(onChange))
  act(() => channel.statusCb?.('CHANNEL_ERROR'))
  expect(result.current.staleSince).toBeInstanceOf(Date)
  act(() => channel.statusCb?.('SUBSCRIBED'))
  expect(result.current.staleSince).toBeNull()
})
