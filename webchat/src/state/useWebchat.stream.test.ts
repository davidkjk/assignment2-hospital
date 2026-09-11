import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebchat } from './useWebchat';
import type { WebchatApi, SessionState, ThreadMessage } from '../api/webchatApi';
import { clearAnonToken } from './anonSession';

const session: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] };

function fakeApi(over: Partial<WebchatApi> = {}): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => session),
    fetchMessages: vi.fn(async () => []),
    // 스트리밍 전환: sendMessage는 ack만 준다(봇 답은 실시간).
    sendMessage: vi.fn(async () => ({ accepted: true, gen: 'g1', routeTaken: null, userMessageId: 'u1' })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
    navigateAction: vi.fn(), revalidateAction: vi.fn(), executeCard: vi.fn(),
    createHandoffTicket: vi.fn(), attributeSessionToAccount: vi.fn(),
    ...over,
  };
}

beforeEach(() => clearAnonToken());

async function opened(api: WebchatApi) {
  const hook = renderHook(() => useWebchat(api));
  await act(async () => { await hook.result.current.open(); });
  return hook;
}

test('[CHAT-STREAM-01] 델타가 누적돼 스트리밍 텍스트를 이루고 done이 봇 말풍선으로 확정한다', async () => {
  const api = fakeApi();
  const { result } = await opened(api);
  await act(async () => { await result.current.send('진료시간 알려줘'); });

  act(() => result.current.applyBotDelta('g1', 1, '안녕'));
  act(() => result.current.applyBotDelta('g1', 2, '하세요'));
  expect(result.current.streaming?.text).toBe('안녕하세요');   // 진행 중 버블

  act(() => result.current.applyBotDone({
    gen: 'g1', messageId: 'b1', routeTaken: 'rag', card: null, outage: false }));
  expect(result.current.streaming).toBeNull();                  // 진행 버블 소멸
  expect(result.current.messages.some((m) => m.senderType === 'bot' && m.content === '안녕하세요')).toBe(true);
  expect(result.current.botTyping).toBe(false);
});

test('[CHAT-STREAM-01] 다른 gen의 델타는 폐기한다', async () => {
  const api = fakeApi();
  const { result } = await opened(api);
  await act(async () => { await result.current.send('질문'); });
  act(() => result.current.applyBotDelta('OTHER', 1, '남의답'));
  expect(result.current.streaming).toBeNull();                  // 내 gen(g1) 아님 → 무시
});

test('[CHAT-STREAM-01] done의 card를 피드에 붙인다(스트리밍된 본문과 함께)', async () => {
  const api = fakeApi();
  const { result } = await opened(api);
  await act(async () => { await result.current.send('우리 동네 약국 어디'); });
  act(() => result.current.applyBotDelta('g1', 1, '바로 답을 찾지 못했어요'));
  act(() => result.current.applyBotDone({
    gen: 'g1', messageId: 'b1', routeTaken: 'no_answer',
    card: { card_type: 'quick_replies', options: ['진료시간이 어떻게 되나요'], handoff_chip: '직원에게 연결' },
    outage: false }));
  const card = result.current.messages.find((m) => m.messageType === 'card');
  expect(card?.payload?.card_type).toBe('quick_replies');
  expect(result.current.messages.some((m) => m.content === '바로 답을 찾지 못했어요')).toBe(true);
});

test('[CHAT-STREAM-OUTAGE-01] done.outage면 장애 상태를 켜고 봇 말풍선은 남기지 않는다', async () => {
  const api = fakeApi();
  const { result } = await opened(api);
  await act(async () => { await result.current.send('진료시간 알려줘'); });
  act(() => result.current.applyBotDone({
    gen: 'g1', messageId: null, routeTaken: 'outage', card: null, outage: true }));
  expect(result.current.outage).toBe('idle');
  expect(result.current.messages.some((m) => m.senderType === 'bot')).toBe(false);
  expect(result.current.streaming).toBeNull();
});

test('[CHAT-STREAM-01] 델타 없는 빠른 경로(emergency)는 DB 재조회로 봇 답을 채운다', async () => {
  const fetchMessages = vi.fn(async () => ([
    { id: 'u1', senderType: 'patient', messageType: 'text', content: '숨을 못 쉬겠어요' },
    { id: 'e1', senderType: 'bot', messageType: 'text', content: '지금 위급한 상황일 수 있어요' },
  ] as ThreadMessage[]));
  const api = fakeApi({ fetchMessages });
  const { result } = await opened(api);
  await act(async () => { await result.current.send('숨을 못 쉬겠어요'); });
  await act(async () => {
    result.current.applyBotDone({ gen: 'g1', messageId: 'e1', routeTaken: 'emergency', card: null, outage: false });
  });
  await waitFor(() => expect(result.current.urgent).toBe(true));
  await waitFor(() =>
    expect(result.current.messages.some((m) => m.content === '지금 위급한 상황일 수 있어요')).toBe(true));
});

test('[WEBCHAT-NEW-01] startNew는 익명 토큰을 비우고 새 세션으로 다시 열어 피드를 초기화한다', async () => {
  const startOrRestoreSession = vi.fn(async (tok: string | null) => ({
    ...session,
    messages: tok ? ([{ id: 'old', senderType: 'bot', messageType: 'text', content: '이전 대화' }] as ThreadMessage[]) : [],
  }));
  const api = fakeApi({ startOrRestoreSession });
  const { result } = await opened(api);                 // 첫 열기: 토큰 없음 → 빈 피드
  act(() => result.current.applyStaffMessage({ id: 'm1', content: '직원답' }));
  expect(result.current.messages.length).toBeGreaterThan(0);

  await act(async () => { await result.current.startNew(); });
  expect(result.current.messages).toEqual([]);          // 새 세션 = 빈 피드(처음부터)
  expect(startOrRestoreSession).toHaveBeenLastCalledWith(null); // 토큰을 비우고 다시 열었다
  expect(result.current.handoff.phase).toBeNull();      // 인계 상태도 초기화
});

test('[CHAT-STREAM-STAFF-MSG-01] applyStaffMessage가 직원 말풍선을 피드에 붙인다(중복 방지)', async () => {
  const api = fakeApi();
  const { result } = await opened(api);
  act(() => result.current.applyStaffMessage({ id: 'm9', content: '확인했습니다' }));
  expect(result.current.messages.filter(
    (m) => m.senderType === 'staff' && m.content === '확인했습니다').length).toBe(1);
  // 같은 id 재수신(broadcast+재조회 겹침)은 두 번 붙지 않는다.
  act(() => result.current.applyStaffMessage({ id: 'm9', content: '확인했습니다' }));
  expect(result.current.messages.filter((m) => m.senderType === 'staff').length).toBe(1);
});

test('[CHAT-STREAM-01] done.routeTaken=handoff면 인계 폼을 연다', async () => {
  const onHandoffRequested = vi.fn();
  const api = fakeApi();
  const hook = renderHook(() => useWebchat(api, { onHandoffRequested }));
  await act(async () => { await hook.result.current.open(); });
  await act(async () => { await hook.result.current.send('직원에게 연결해주세요'); });
  act(() => hook.result.current.applyBotDone({
    gen: 'g1', messageId: null, routeTaken: 'handoff', card: null, outage: false }));
  expect(onHandoffRequested).toHaveBeenCalledWith('t1');
});
