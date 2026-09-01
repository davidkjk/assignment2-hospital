import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebchat } from './useWebchat';
import type { WebchatApi, SessionState, ThreadMessage } from '../api/webchatApi';
import { saveAnonToken, loadAnonToken, clearAnonToken } from './anonSession';

const session: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] };
function fakeApi(over: Partial<WebchatApi> = {}): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => session),
    fetchMessages: vi.fn(async () => []),
    sendMessage: vi.fn(async () => ({ routeTaken: 'rag', botMessage: {
      id: 'b1', senderType: 'bot', messageType: 'text', content: '네, 가능합니다' } as ThreadMessage })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
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
