import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { WebchatWidget } from './WebchatWidget';
import type { WebchatApi, SessionState } from '../api/webchatApi';
import { supabase } from '../lib/supabaseClient';
import { clearAnonToken } from '../state/anonSession';

// 채널 mock — 봇 이벤트 핸들러를 저장해 테스트가 서버 발행을 흉내낸다(presence 테스트와 동형).
interface FakeChannel {
  handlers: Record<string, (msg: { payload?: unknown }) => void>;
  on(type: string, filter: { event: string }, cb: (msg: { payload?: unknown }) => void): FakeChannel;
  subscribe(cb?: (status: string) => void): FakeChannel;
  send(msg: unknown): Promise<'ok'>;
}
function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    handlers: {},
    on(_t, f, cb) { ch.handlers[f.event] = cb; return ch; },
    subscribe(cb) { cb?.('SUBSCRIBED'); return ch; },
    async send() { return 'ok'; },
  };
  return ch;
}
let channel: FakeChannel;
vi.mock('../lib/supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}));

const emptySession: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] };
function fakeApi(): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => emptySession),
    fetchMessages: vi.fn(async () => emptySession.messages),
    sendMessage: vi.fn(async () => ({ accepted: true, gen: 'g1', routeTaken: null, userMessageId: 'u1' })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
    navigateAction: vi.fn(), revalidateAction: vi.fn(), executeCard: vi.fn(),
    createHandoffTicket: vi.fn(), attributeSessionToAccount: vi.fn(),
  };
}

beforeEach(() => {
  clearAnonToken();
  vi.clearAllMocks();
  channel = makeChannel();
  (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(channel);
});

test('[CHAT-STREAM-01] 전송 후 실시간 델타가 화면에 흐르고 done이 최종 봇 말풍선을 남긴다', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await userEvent.click(await screen.findByRole('button', { name: '진료시간' })); // 시작 칩으로 전송(ack gen=g1)
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());

  // 서버가 델타를 흘린다 — 진행 중 텍스트가 화면에 보인다.
  act(() => channel.handlers['bot_delta']?.({ payload: { gen: 'g1', seq: 1, text: '평일 09시부터' } }));
  act(() => channel.handlers['bot_delta']?.({ payload: { gen: 'g1', seq: 2, text: ' 18시입니다.' } }));
  expect(await screen.findByText('평일 09시부터 18시입니다.')).toBeInTheDocument();

  // 완료 — 최종 봇 말풍선으로 확정(스트리밍 버블 → 확정 메시지).
  act(() => channel.handlers['bot_done']?.({
    payload: { gen: 'g1', messageId: 'b1', routeTaken: 'rag', card: null, outage: false } }));
  expect(await screen.findByText('평일 09시부터 18시입니다.')).toBeInTheDocument();
});

test('[WEBCHAT-NEW-01] 인계 없을 땐 새 상담이 확인창 없이 바로 새 세션을 연다', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  const btn = await screen.findByRole('button', { name: '새 상담' });
  const before = (api.startOrRestoreSession as ReturnType<typeof vi.fn>).mock.calls.length;
  await userEvent.click(btn);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();   // 확인창 없이
  await waitFor(() => expect((api.startOrRestoreSession as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before));
});

test('[WEBCHAT-NEW-01] 진행 중 직원 상담이면 확인창 먼저 → 새로 시작에 새 세션을 연다', async () => {
  const api = fakeApi();
  (api.fetchHandoff as ReturnType<typeof vi.fn>).mockResolvedValue({ phase: 'connecting', isOpen: true, closed: false });
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await screen.findByText('직원 확인 전이에요');   // 인계 활성 상태가 반영됨(phase=connecting)
  await userEvent.click(screen.getByRole('button', { name: '새 상담' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();   // 실수 이탈 방지 확인창
  const before = (api.startOrRestoreSession as ReturnType<typeof vi.fn>).mock.calls.length;
  await userEvent.click(screen.getByRole('button', { name: '새로 시작' }));
  await waitFor(() => expect((api.startOrRestoreSession as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('[WEBCHAT-CLOSE-01] 헤더 닫기(×)를 누르면 위젯이 접히고(패널 사라짐) 호스트에 setOpen:false를 통지한다', async () => {
  const api = fakeApi();
  const onOpenChange = vi.fn();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} onOpenChange={onOpenChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  const closeBtn = await screen.findByRole('button', { name: '닫기' });
  await userEvent.click(closeBtn);
  // 호스트(홈페이지)로 닫힘 통지 → 홈페이지가 iframe 패널을 닫는다.
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  // 헤더 컨트롤(새 상담)도 사라진다(패널 언마운트).
  await waitFor(() => expect(screen.queryByRole('button', { name: '새 상담' })).not.toBeInTheDocument());
});

test('[WEBCHAT-URGENT] done.routeTaken=emergency면 긴급 안내 배너와 면책 문구를 렌더한다', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await userEvent.click(await screen.findByRole('button', { name: '진료시간' }));
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());
  act(() => channel.handlers['bot_done']?.({
    payload: { gen: 'g1', messageId: 'e1', routeTaken: 'emergency', card: null, outage: false } }));
  expect(await screen.findByText('이 안내는 긴급 여부를 완벽히 판단하거나 진단하는 것이 아닙니다.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /시간 선택|예약 신청/ })).not.toBeInTheDocument(); // URGENT-03
});

test('[NAV-WEBCHAT-05b] done.routeTaken=handoff면 익명 인계 폼(onHandoffNeeded)을 연다', async () => {
  const onHandoffNeeded = vi.fn();
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={onHandoffNeeded} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await userEvent.click(await screen.findByRole('button', { name: '진료시간' }));
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalled());
  act(() => channel.handlers['bot_done']?.({
    payload: { gen: 'g1', messageId: null, routeTaken: 'handoff', card: null, outage: false } }));
  expect(onHandoffNeeded).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1' }));
});
