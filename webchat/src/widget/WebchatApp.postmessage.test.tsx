import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebchatApp } from './WebchatApp';
import type { WebchatApi } from '../api/webchatApi';
import type { WebAuth } from '../auth/webAuth';
import { clearAnonToken } from '../state/anonSession';

// 홈페이지 iframe 통합(Task 2)의 postMessage 계약을 검증한다.
// 단독/테스트에선 window.parent === window라 스파이가 자기 자신에게 오는 메시지를 잡는다.
function fakeApi(): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => ({ threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] })),
    fetchMessages: vi.fn(async () => []),
    sendMessage: vi.fn(async () => ({ routeTaken: 'rag' })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
    revalidateAction: vi.fn(), executeCard: vi.fn(), createHandoffTicket: vi.fn(), attributeSessionToAccount: vi.fn(),
  } as unknown as WebchatApi;
}
function fakeAuth(): WebAuth {
  return { login: vi.fn(async () => ({ ok: true as const, patientId: 'p1' })), signup: vi.fn(async () => ({ ok: true as const, patientId: 'p1' })) };
}

beforeEach(() => clearAnonToken());

test('[iframe] 마운트 시 부모로 webchat:ready 를 통지한다', () => {
  const spy = vi.spyOn(window.parent, 'postMessage');
  render(<WebchatApp api={fakeApi()} auth={fakeAuth()} hospitalPhone="" />);
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'webchat:ready' }), expect.any(String));
});

test('[iframe] 열림 상태가 바뀌면 부모로 webchat:setOpen(true) 를 통지한다', async () => {
  const spy = vi.spyOn(window.parent, 'postMessage');
  render(<WebchatApp api={fakeApi()} auth={fakeAuth()} hospitalPhone="" />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => expect(spy).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'webchat:setOpen', value: true }),
    expect.any(String),
  ));
});

test('[iframe] 부모의 host:setOpen(true) 를 받으면 위젯을 연다(런처 클릭 없이)', async () => {
  render(<WebchatApp api={fakeApi()} auth={fakeAuth()} hospitalPhone="" />);
  expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'host:setOpen', value: true }, origin: window.location.origin,
    }));
  });
  await waitFor(() => expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()); // 방이 열림
});
