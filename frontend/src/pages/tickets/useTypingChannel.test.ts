import { renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { typingChannelName, useTypingChannel } from './useTypingChannel'
import { supabase } from '../../lib/supabaseClient'

// 제어 가능한 broadcast 채널 mock — send로 무엇을 보냈는지 기록한다.
interface FakeChannel {
  sent: unknown[]
  subscribed: boolean
  subscribe(): FakeChannel
  send(msg: unknown): Promise<'ok'>
}

function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    sent: [],
    subscribed: false,
    subscribe() {
      ch.subscribed = true
      return ch
    },
    async send(msg) {
      ch.sent.push(msg)
      return 'ok'
    },
  }
  return ch
}

let channel: FakeChannel

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  channel = makeChannel()
  ;(supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel)
})

test('[TICKET-DETAIL-TYPING-01] 채널 이름은 thread를 키로 하고 환자앱과 같은 형식이다', () => {
  expect(typingChannelName('t-123')).toBe('chat-typing:t-123')
})

test('[TICKET-DETAIL-TYPING-01] thread로 채널을 한 번만 열고 구독한다', () => {
  renderHook(() => useTypingChannel('t-1'))
  expect(supabase.channel).toHaveBeenCalledTimes(1)
  expect(supabase.channel).toHaveBeenCalledWith('chat-typing:t-1', expect.anything())
  expect(channel.subscribed).toBe(true)
})

test('[TICKET-DETAIL-TYPING-01] emit(true)/emit(false)를 role=staff broadcast로 보낸다', () => {
  const { result } = renderHook(() => useTypingChannel('t-1'))
  result.current(true)
  result.current(false)
  expect(channel.sent).toEqual([
    { type: 'broadcast', event: 'typing', payload: { role: 'staff', on: true } },
    { type: 'broadcast', event: 'typing', payload: { role: 'staff', on: false } },
  ])
})

test('threadId가 없으면 채널을 열지 않고 emit은 no-op(로딩 전 안전)', () => {
  const { result } = renderHook(() => useTypingChannel(undefined))
  expect(supabase.channel).not.toHaveBeenCalled()
  result.current(true) // 던지지 않는다
  expect(channel.sent).toEqual([])
})

test('언마운트 시 채널을 정리한다(누수 방지)', () => {
  const { unmount } = renderHook(() => useTypingChannel('t-1'))
  unmount()
  expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
})
