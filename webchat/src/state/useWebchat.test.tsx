import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebchat } from './useWebchat';
import type { WebchatApi, SessionState } from '../api/webchatApi';
import { saveAnonToken, loadAnonToken, clearAnonToken } from './anonSession';

const session: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] };
function fakeApi(over: Partial<WebchatApi> = {}): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => session),
    fetchMessages: vi.fn(async () => []),
    // 스트리밍 전환: sendMessage는 ack만 준다(봇 답은 실시간). 봇 동작은 useWebchat.stream.test.ts가 덮는다.
    sendMessage: vi.fn(async () => ({ accepted: true, gen: 'g1', routeTaken: null, userMessageId: 'u1' })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
    navigateAction: vi.fn(), revalidateAction: vi.fn(), executeCard: vi.fn(), createHandoffTicket: vi.fn(), attributeSessionToAccount: vi.fn(),
    ...over,
  };
}
beforeEach(() => clearAnonToken());

test('[WEBCHAT-ROOM-03] 익명 토큰이 없으면 첫 상담 세션을 시작하고 서버 토큰을 저장한다', async () => {
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  expect(api.startOrRestoreSession).toHaveBeenCalledWith(null); // 토큰 없음 → 첫 상담
  await waitFor(() => expect(result.current.phase).toBe('ready'));
  expect(loadAnonToken()).toBe('TOK'); // 같은 브라우저 복원용으로 저장
});

test('[WEBCHAT-ROOM-04] 유효한 익명 토큰이 있으면 복원 — 이름/연락처를 다시 묻지 않는다', async () => {
  saveAnonToken('OLD');
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  expect(api.startOrRestoreSession).toHaveBeenCalledWith('OLD'); // 토큰으로 기존 대화 복원
  expect(result.current.askedForContact).toBe(false);            // 새 방으로 가장 안 함
});

test('[WEBCHAT-ROOM-05] 다른 기기(토큰 없음)엔 이어보기 경로가 없다 — 이름/전화로 추측 조회 안 함', async () => {
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  expect(loadAnonToken()).toBeNull();          // 다른 기기엔 토큰이 없다
  await act(async () => { await result.current.open(); });
  expect(api.startOrRestoreSession).toHaveBeenCalledWith(null); // 새 익명 세션일 뿐, 남의 상담을 찾지 않음
  expect(result.current.crossDeviceResume).toBe(false);
});

test('[WEBCHAT-ROOM-07] 세션 조회 실패면 loadError — 토큰을 지우지 않는다', async () => {
  saveAnonToken('KEEP');
  const api = fakeApi({ startOrRestoreSession: vi.fn(async () => { throw new Error('webchat_api_500'); }) });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await waitFor(() => expect(result.current.phase).toBe('loadError'));
  expect(loadAnonToken()).toBe('KEEP'); // 조회 실패로 토큰 삭제 금지
});

test('[WEBCHAT-ROOM-08] 전송은 clientMessageId를 부여해 멱등 — 같은 전송 중 메시지를 중복 전송하지 않는다', async () => {
  const api = fakeApi();
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('주차 되나요?'); });
  const call = (api.sendMessage as any).mock.calls[0][0];
  expect(typeof call.clientMessageId).toBe('string');       // 멱등 키 부여(§8-4)
  expect(call.content).toBe('주차 되나요?');
});

test('[WEBCHAT-OUTAGE] ack 전송이 5xx면 장애를 켜고, 봇 답 도착(applyBotDone)이면 배너를 걷는다', async () => {
  const send = vi.fn()
    .mockRejectedValueOnce(new Error('webchat_api_500'))
    .mockResolvedValueOnce({ accepted: true, gen: 'g2', routeTaken: null, userMessageId: 'u2' });
  const api = fakeApi({ sendMessage: send });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('진료시간 알려줘'); });
  expect(result.current.outage).toBe('idle');         // ack 전송 5xx = AI 장애 안내 켜짐(WEBCHAT-OUTAGE-01)
  expect(result.current.messages.some((m) => m.sendState === 'failed')).toBe(true); // 실패 말풍선과 공존(ROOM-09)
  const failed = result.current.messages.find((m) => m.sendState === 'failed');
  await act(async () => { await result.current.resend(failed!.clientMessageId!); });
  // resend는 ack만 받는다 — 실제 봇 답(applyBotDone)이 도착해야 장애 해제(성공 왕복으로만 복구).
  act(() => result.current.applyBotDone({ gen: 'g2', messageId: 'b2', routeTaken: 'rag', card: null, outage: false }));
  expect(result.current.outage).toBeNull();           // CHAT-OUTAGE-RECOVER-01
});

test('[WEBCHAT-OUTAGE] 4xx(세션 등)은 장애로 보지 않는다 — 배너를 띄우지 않는다', async () => {
  const api = fakeApi({ sendMessage: vi.fn(async () => { throw new Error('webchat_api_409'); }) });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('예약 바꿔줘'); });
  expect(result.current.outage).toBeNull();           // 4xx는 AI 장애가 아님(다른 경로가 처리)
});

test('[WEBANON-HANDOFF] 일반 응답(rag)에서는 인계 폼을 열지 않는다', async () => {
  const onHandoffRequested = vi.fn();
  const api = fakeApi(); // 기본 ack(routeTaken=null) — 인계 아님
  const { result } = renderHook(() => useWebchat(api, { onHandoffRequested }));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('주차 되나요?'); });
  expect(onHandoffRequested).not.toHaveBeenCalled(); // 인계가 아닌 턴은 폼을 열지 않음
  // 봇 done이 rag면 여전히 폼을 안 연다(handoff일 때만 — 인계 전이는 stream 테스트가 덮는다).
  act(() => result.current.applyBotDone({ gen: 'g1', messageId: 'b1', routeTaken: 'rag', card: null, outage: false }));
  expect(onHandoffRequested).not.toHaveBeenCalled();
});

test('[WEBCHAT-ROOM-09] 전송 실패면 말풍선을 failed로 두고 resend는 같은 clientMessageId로 재전송', async () => {
  const send = vi.fn()
    .mockRejectedValueOnce(new Error('webchat_api_500'))
    .mockResolvedValueOnce({ routeTaken: 'rag' });
  const api = fakeApi({ sendMessage: send });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await act(async () => { await result.current.send('예약 되나요?'); });
  const failed = result.current.messages.find((m) => m.sendState === 'failed');
  expect(failed?.content).toBe('예약 되나요?');
  await act(async () => { await result.current.resend(failed!.clientMessageId!); });
  expect(send.mock.calls[0][0].clientMessageId).toBe(send.mock.calls[1][0].clientMessageId); // 동일 키
});

test('[Q18①] 세션 진입 시 인계 상태를 능동적으로 가져와 배지에 반영한다(제출 후 무반응 해소)', async () => {
  // 예전엔 handoff를 setHandoff로만 갱신해, 인계 폼 제출 후에도 배지가 안 떴다(아무 변화 없음).
  // 세션이 생기면 fetchHandoff로 최신 인계 상태를 가져와 배지가 뜨게 한다.
  const api = fakeApi({ fetchHandoff: vi.fn(async () => ({ phase: 'connecting' as const, isOpen: true })) });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  await waitFor(() => expect(result.current.handoff.phase).toBe('connecting'));
  expect(api.fetchHandoff).toHaveBeenCalledWith('t1');
});

test('[Q18①] refreshHandoff로 제출 직후 즉시 상태를 다시 가져올 수 있다', async () => {
  const fetchHandoff = vi.fn(async () => ({ phase: 'connecting' as const, isOpen: true }));
  const api = fakeApi({ fetchHandoff });
  const { result } = renderHook(() => useWebchat(api));
  await act(async () => { await result.current.open(); });
  fetchHandoff.mockClear();
  await act(async () => { await result.current.refreshHandoff(); });
  expect(fetchHandoff).toHaveBeenCalledWith('t1');
});
