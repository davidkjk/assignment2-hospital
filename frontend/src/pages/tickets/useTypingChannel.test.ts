import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { typingChannelName, useTypingChannel } from './useTypingChannel'
import { supabase } from '../../lib/supabaseClient'

// 제어 가능한 broadcast 채널 mock — send는 기록하고, on 핸들러를 저장해 테스트가 수신을 흉내낸다.
interface FakeChannel {
  sent: unknown[]
  subscribed: boolean
  handlers: Record<string, (msg: { payload?: unknown }) => void>
  on(type: string, filter: { event: string }, cb: (msg: { payload?: unknown }) => void): FakeChannel
  subscribe(cb?: (status: string) => void): FakeChannel
  send(msg: unknown): Promise<'ok'>
}

// 기본 fake는 subscribe 콜백을 무시한다(구독 상태 콜백 없음) → viewing:true는 안 나간다.
// presence-on 테스트는 콜백을 부르는 별도 fake를 쓴다.
function makeChannel(invokeSubscribed = false): FakeChannel {
  const ch: FakeChannel = {
    sent: [],
    subscribed: false,
    handlers: {},
    on(_type, filter, cb) {
      ch.handlers[filter.event] = cb
      return ch
    },
    subscribe(cb) {
      ch.subscribed = true
      if (invokeSubscribed) cb?.('SUBSCRIBED')
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
  vi.useFakeTimers()
  channel = makeChannel()
  ;(supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel)
})

afterEach(() => {
  vi.useRealTimers()
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

test('[TICKET-DETAIL-TYPING-01] send(true)/send(false)를 role=staff broadcast로 보낸다', () => {
  const { result } = renderHook(() => useTypingChannel('t-1'))
  result.current.send(true)
  result.current.send(false)
  expect(channel.sent).toEqual([
    { type: 'broadcast', event: 'typing', payload: { role: 'staff', on: true } },
    { type: 'broadcast', event: 'typing', payload: { role: 'staff', on: false } },
  ])
})

test('threadId가 없으면 채널을 열지 않고 send은 no-op(로딩 전 안전)', () => {
  const { result } = renderHook(() => useTypingChannel(undefined))
  expect(supabase.channel).not.toHaveBeenCalled()
  result.current.send(true) // 던지지 않는다
  expect(channel.sent).toEqual([])
})

test('언마운트 시 채널을 정리한다(누수 방지)', () => {
  const { unmount } = renderHook(() => useTypingChannel('t-1'))
  unmount()
  expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
})

test('[TICKET-DETAIL-PRESENCE-01] 상세를 열어 구독되면 열람 presence(viewing:true)를 보낸다', () => {
  const ch = makeChannel(true) // subscribe 콜백을 SUBSCRIBED로 부른다
  ;(supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(ch)
  renderHook(() => useTypingChannel('t-1'))
  expect(ch.sent).toContainEqual({ type: 'broadcast', event: 'viewing', payload: { role: 'staff', on: true } })
})

test('[TICKET-DETAIL-PRESENCE-01] 상세를 닫으면(언마운트) 열람 종료(viewing:false)를 보낸다', () => {
  const { unmount } = renderHook(() => useTypingChannel('t-1'))
  unmount()
  expect(channel.sent).toContainEqual({ type: 'broadcast', event: 'viewing', payload: { role: 'staff', on: false } })
})

test('[TICKET-DETAIL-PATIENT-TYPING-01] 환자 입력 중(typing:patient/on) 수신 시 patientTyping=true, role=staff는 무시', () => {
  const { result } = renderHook(() => useTypingChannel('t-1'))
  act(() => channel.handlers['typing']?.({ payload: { role: 'staff', on: true } }))
  expect(result.current.patientTyping).toBe(false) // 직원 자기 신호는 표시 안 함
  act(() => channel.handlers['typing']?.({ payload: { role: 'patient', on: true } }))
  expect(result.current.patientTyping).toBe(true)
  act(() => channel.handlers['typing']?.({ payload: { role: 'patient', on: false } }))
  expect(result.current.patientTyping).toBe(false)
})

test('[TICKET-DETAIL-PATIENT-TYPING-01] 끔 신호 유실 대비 6초 안전 타임아웃으로 자동 해제', () => {
  const { result } = renderHook(() => useTypingChannel('t-1'))
  act(() => channel.handlers['typing']?.({ payload: { role: 'patient', on: true } }))
  expect(result.current.patientTyping).toBe(true)
  act(() => vi.advanceTimersByTime(6000))
  expect(result.current.patientTyping).toBe(false)
})

test('[TICKET-DETAIL-PATIENT-PRESENCE-01] 환자 접속(viewing:patient/on) 수신 시 patientViewing=true', () => {
  const { result } = renderHook(() => useTypingChannel('t-1'))
  act(() => channel.handlers['viewing']?.({ payload: { role: 'patient', on: true } }))
  expect(result.current.patientViewing).toBe(true)
  act(() => channel.handlers['viewing']?.({ payload: { role: 'patient', on: false } }))
  expect(result.current.patientViewing).toBe(false)
})

test('[TICKET-DETAIL-PATIENT-PRESENCE-01] 접속 끔 신호 유실 대비 12초 안전 타임아웃', () => {
  const { result } = renderHook(() => useTypingChannel('t-1'))
  act(() => channel.handlers['viewing']?.({ payload: { role: 'patient', on: true } }))
  expect(result.current.patientViewing).toBe(true)
  act(() => vi.advanceTimersByTime(12000))
  expect(result.current.patientViewing).toBe(false)
})
