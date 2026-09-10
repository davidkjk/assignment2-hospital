import { renderHook, act } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { useStaffPresence } from './useStaffPresence';
import { supabase } from '../lib/supabaseClient';

// 봇 스트리밍 이벤트(bot_typing/bot_delta/bot_done)를 같은 채널에서 수신하는지 검증한다.
// useStaffPresence.test.ts와 같은 제어 가능한 채널 mock을 재사용한다(핸들러를 저장해 수신 흉내).
interface FakeChannel {
  sent: unknown[];
  handlers: Record<string, (msg: { payload?: unknown }) => void>;
  on(type: string, filter: { event: string }, cb: (msg: { payload?: unknown }) => void): FakeChannel;
  subscribe(cb?: (status: string) => void): FakeChannel;
  send(msg: unknown): Promise<'ok'>;
}

function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    sent: [],
    handlers: {},
    on(_type, filter, cb) {
      ch.handlers[filter.event] = cb;
      return ch;
    },
    subscribe(cb) {
      cb?.('SUBSCRIBED');
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
  channel = makeChannel();
  (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel);
});

test('[CHAT-STREAM-01] 같은 채널에서 bot_typing/bot_delta/bot_done을 수신해 핸들러를 부른다', () => {
  const onBotTyping = vi.fn();
  const onBotDelta = vi.fn();
  const onBotDone = vi.fn();
  renderHook(() =>
    useStaffPresence('t-1', { onBotTyping, onBotDelta, onBotDone }),
  );
  // 새 채널을 또 열지 않는다(같은 토픽 2채널=한쪽 유실).
  expect(supabase.channel).toHaveBeenCalledTimes(1);

  act(() => channel.handlers['bot_typing']?.({ payload: { gen: 'g1', on: true } }));
  expect(onBotTyping).toHaveBeenCalledWith(true, 'g1');

  act(() => channel.handlers['bot_delta']?.({ payload: { gen: 'g1', seq: 1, text: '안녕' } }));
  expect(onBotDelta).toHaveBeenCalledWith('g1', 1, '안녕');

  act(() =>
    channel.handlers['bot_done']?.({
      payload: { gen: 'g1', messageId: 'm1', routeTaken: 'rag', card: null, outage: false },
    }),
  );
  expect(onBotDone).toHaveBeenCalledWith(
    expect.objectContaining({ gen: 'g1', messageId: 'm1', routeTaken: 'rag', outage: false }),
  );
});

test('[CHAT-STREAM-01] 핸들러 없이도 봇 이벤트가 던지지 않는다(optional)', () => {
  renderHook(() => useStaffPresence('t-1'));
  expect(() =>
    act(() => channel.handlers['bot_delta']?.({ payload: { gen: 'g1', seq: 1, text: 'x' } })),
  ).not.toThrow();
});
