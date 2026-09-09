import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useStaffPresence } from './useStaffPresence';
import { supabase } from '../lib/supabaseClient';

// 제어 가능한 broadcast 채널 mock — on 핸들러를 저장해 테스트가 수신을 흉내내고, send를 기록한다.
interface FakeChannel {
  sent: unknown[];
  handlers: Record<string, (msg: { payload?: unknown }) => void>;
  on(type: string, filter: { event: string }, cb: (msg: { payload?: unknown }) => void): FakeChannel;
  subscribe(cb?: (status: string) => void): FakeChannel;
  send(msg: unknown): Promise<'ok'>;
}

function makeChannel(invokeSubscribed = true): FakeChannel {
  const ch: FakeChannel = {
    sent: [],
    handlers: {},
    on(_type, filter, cb) {
      ch.handlers[filter.event] = cb;
      return ch;
    },
    subscribe(cb) {
      if (invokeSubscribed) cb?.('SUBSCRIBED');
      return ch;
    },
    async send(msg) {
      ch.sent.push(msg);
      return 'ok';
    },
  };
  return ch;
}

let channel: FakeChannel;

vi.mock('../lib/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  channel = makeChannel();
  (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel);
});

afterEach(() => {
  vi.useRealTimers();
});

test('[WEBCHAT-HANDOFF] thread로 채널을 한 번만 열고 구독한다', () => {
  renderHook(() => useStaffPresence('t-1'));
  expect(supabase.channel).toHaveBeenCalledTimes(1);
  expect(supabase.channel).toHaveBeenCalledWith('chat-typing:t-1', expect.anything());
});

test('[CHAT-ROOM-PATIENT-PRESENCE-01] 구독되면(방 열림) 환자 열람(viewing:patient/on)을 보낸다', () => {
  renderHook(() => useStaffPresence('t-1'));
  expect(channel.sent).toContainEqual({
    type: 'broadcast',
    event: 'viewing',
    payload: { role: 'patient', on: true },
  });
});

test('[CHAT-ROOM-PATIENT-PRESENCE-01] 위젯을 닫으면(언마운트) 환자 열람 종료(viewing:patient/off)를 보낸다', () => {
  const { unmount } = renderHook(() => useStaffPresence('t-1'));
  unmount();
  expect(channel.sent).toContainEqual({
    type: 'broadcast',
    event: 'viewing',
    payload: { role: 'patient', on: false },
  });
  expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
});

test('[CHAT-ROOM-PATIENT-TYPING-01] notifyTyping은 첫 입력에 typing on을 한 번만 보낸다', () => {
  const { result } = renderHook(() => useStaffPresence('t-1'));
  act(() => {
    result.current.notifyTyping();
    result.current.notifyTyping();
  });
  const typingSends = channel.sent.filter(
    (m) => (m as { event?: string }).event === 'typing',
  );
  expect(typingSends).toEqual([
    { type: 'broadcast', event: 'typing', payload: { role: 'patient', on: true } },
  ]);
});

test('[CHAT-ROOM-PATIENT-TYPING-01] 마지막 입력 후 3초 유휴면 typing off를 보낸다', () => {
  const { result } = renderHook(() => useStaffPresence('t-1'));
  act(() => result.current.notifyTyping());
  act(() => vi.advanceTimersByTime(3000));
  const typingSends = channel.sent.filter(
    (m) => (m as { event?: string }).event === 'typing',
  );
  expect(typingSends).toEqual([
    { type: 'broadcast', event: 'typing', payload: { role: 'patient', on: true } },
    { type: 'broadcast', event: 'typing', payload: { role: 'patient', on: false } },
  ]);
});

test('[WEBCHAT-HANDOFF] 직원 viewing:on 수신 시 staffViewing=true, role=patient는 무시', () => {
  const { result } = renderHook(() => useStaffPresence('t-1'));
  act(() => channel.handlers['viewing']?.({ payload: { role: 'patient', on: true } }));
  expect(result.current.staffViewing).toBe(false); // 내 것(환자)은 표시 안 함
  act(() => channel.handlers['viewing']?.({ payload: { role: 'staff', on: true } }));
  expect(result.current.staffViewing).toBe(true);
});

test('threadId가 없으면(로딩 전) 채널을 열지 않고 notifyTyping은 no-op', () => {
  const { result } = renderHook(() => useStaffPresence(undefined));
  expect(supabase.channel).not.toHaveBeenCalled();
  expect(result.current.staffViewing).toBe(false);
  act(() => result.current.notifyTyping()); // 던지지 않는다
});
