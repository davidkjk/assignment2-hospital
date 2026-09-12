import { createWebchatApi } from './webchatApi';
import { saveAnonToken, clearAnonToken } from '../state/anonSession';

beforeEach(() => { clearAnonToken(); vi.restoreAllMocks(); });

test('[Step1] revalidateAction은 X-Anon-Token을 실어 재검증 엔드포인트로 POST한다(로그인 세션 저장 없음)', async () => {
  saveAnonToken('TOK');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ card: { id: 'c1', senderType: 'bot', messageType: 'card', content: null, payload: { card_type: 'booking_confirm' } } }), { status: 200 }));
  const api = createWebchatApi('http://x/functions/v1');
  const { card } = await api.revalidateAction({ action: { kind: 'book', payload: { slot_at: '2026-08-20T10:00' } } });
  expect(card!.payload.card_type).toBe('booking_confirm');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://x/functions/v1/chat/cards/revalidate');
  expect((init!.headers as Record<string, string>)['X-Anon-Token']).toBe('TOK'); // 익명 토큰으로 소유권
});

test('[⑦] 인증 후 재검증·실행·귀속은 getAccessToken의 Bearer로 환자 신원을 싣는다', async () => {
  // 서버는 body의 patientId가 아니라 Bearer로 환자를 확정한다(위조 방지). 익명 토큰만으론 401.
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response(JSON.stringify({ card: { id: 'c1', senderType: 'bot', messageType: 'card', content: null, payload: { card_type: 'booking_confirm' } }, result: { id: 'r1', senderType: 'bot', messageType: 'card', content: null, payload: { card_type: 'booking_done' } } }), { status: 200 }));
  const api = createWebchatApi('http://x/functions/v1', { getAccessToken: async () => 'JWT123' });
  await api.revalidateAction({ action: { kind: 'book', payload: {} } });
  await api.executeCard({ cardType: 'booking_confirm', payload: {}, clientMessageId: 'm1' });
  await api.attributeSessionToAccount({ patientId: 'p1' });
  for (const call of fetchMock.mock.calls) {
    expect((call[1]!.headers as Record<string, string>)['Authorization']).toBe('Bearer JWT123');
  }
});

test('[⑦] getAccessToken이 없으면(토큰 미확보) Authorization을 붙이지 않는다', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ card: null }), { status: 200 }));
  const api = createWebchatApi('http://x/functions/v1', { getAccessToken: async () => null });
  await api.revalidateAction({ action: { kind: 'view_my_appointments' } });
  expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>)['Authorization']).toBeUndefined();
});

test('[sendMessage] 서버 ack(accepted·gen·routeTaken·userMessageId)를 그대로 매핑한다', async () => {
  // 스트리밍 전환: /chat/messages는 봇 답을 싣지 않고 ack만 준다(봇 답은 실시간 채널).
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ accepted: true, threadId: 't1', userMessageId: 'u9', gen: 'g9', routeTaken: null }), { status: 200 }));
  const api = createWebchatApi('http://x');
  const out = await api.sendMessage({ threadId: 't1', aiSessionId: 's1', content: '와이파이 되나요?', clientMessageId: 'm1' });
  expect(fetchMock.mock.calls[0][0]).toBe('http://x/chat/messages');
  expect(out).toMatchObject({ accepted: true, gen: 'g9', routeTaken: null, userMessageId: 'u9' });
});

test('[sendMessage] 인계 모드(routeTaken=staff)도 ack로 그대로 전달한다', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ accepted: true, threadId: 't1', userMessageId: 'u2', gen: 'g2', routeTaken: 'staff' }), { status: 200 }));
  const api = createWebchatApi('http://x');
  const out = await api.sendMessage({ threadId: 't1', aiSessionId: 's1', content: '직원분 안녕', clientMessageId: 'm2' });
  expect(out.routeTaken).toBe('staff');
  expect(out.gen).toBe('g2');
});

test('[G7] 로그인 후 sendMessage는 Bearer를 실어 환자 경로(load_owned_session)를 타게 한다 — 귀속된 스레드에서 대화가 끊기지 않도록', async () => {
  // 로그인+예약 시 attribute_session_to_patient가 스레드를 환자 소유로 바꾸는데, 익명 경로는 owner_type='anonymous_web'만
  // 찾아 404 → 예약 후 대화 불가. getAccessToken이 토큰을 주면 Bearer를 붙여 patient 경로로 간다.
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ accepted: true, threadId: 't1', userMessageId: 'u1', gen: 'g1', routeTaken: null }), { status: 200 }));
  const api = createWebchatApi('http://x', { getAccessToken: async () => 'JWT123' });
  await api.sendMessage({ threadId: 't1', aiSessionId: 's1', content: '예약 다 됐어요, 하나 더 물어볼게요', clientMessageId: 'm1' });
  expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>)['Authorization']).toBe('Bearer JWT123');
});

test('[G7] 미로그인 sendMessage는 Bearer 없이 익명 토큰만 실어 익명 경로를 유지한다', async () => {
  saveAnonToken('ANON9');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ accepted: true, threadId: 't1', userMessageId: 'u1', gen: 'g1', routeTaken: null }), { status: 200 }));
  const api = createWebchatApi('http://x', { getAccessToken: async () => null });
  await api.sendMessage({ threadId: 't1', aiSessionId: 's1', content: '와이파이 되나요?', clientMessageId: 'm1' });
  const headers = fetchMock.mock.calls[0][1]!.headers as Record<string, string>;
  expect(headers['Authorization']).toBeUndefined();
  expect(headers['X-Anon-Token']).toBe('ANON9');
});

test('[Step1] createHandoffTicket은 인계 엔드포인트로 이름·연락처·요약을 POST한다', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ticketId: 'tk1' }), { status: 200 }));
  const api = createWebchatApi('http://x/functions/v1');
  const { ticketId } = await api.createHandoffTicket({ threadId: 't1', name: '홍길동', phone: '01000000000', summary: ['a'] });
  expect(ticketId).toBe('tk1');
  expect(fetchMock.mock.calls[0][0]).toBe('http://x/functions/v1/chat/handoff');
});
