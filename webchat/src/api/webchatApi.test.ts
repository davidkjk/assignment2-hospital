import { createWebchatApi } from './webchatApi';
import { saveAnonToken, clearAnonToken } from '../state/anonSession';

beforeEach(() => { clearAnonToken(); vi.restoreAllMocks(); });

test('[Step1] revalidateAction은 X-Anon-Token을 실어 재검증 엔드포인트로 POST한다(로그인 세션 저장 없음)', async () => {
  saveAnonToken('TOK');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ card: { id: 'c1', senderType: 'bot', messageType: 'card', content: null, payload: { card_type: 'booking_confirm' } } }), { status: 200 }));
  const api = createWebchatApi('http://x/functions/v1');
  const { card } = await api.revalidateAction({ action: { kind: 'book', payload: { slot_at: '2026-08-20T10:00' } } });
  expect(card.payload.card_type).toBe('booking_confirm');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://x/functions/v1/chat/cards/revalidate');
  expect((init!.headers as Record<string, string>)['X-Anon-Token']).toBe('TOK'); // 익명 토큰으로 소유권
});

test('[Step1] createHandoffTicket은 인계 엔드포인트로 이름·연락처·요약을 POST한다', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ticketId: 'tk1' }), { status: 200 }));
  const api = createWebchatApi('http://x/functions/v1');
  const { ticketId } = await api.createHandoffTicket({ threadId: 't1', name: '홍길동', phone: '01000000000', summary: ['a'] });
  expect(ticketId).toBe('tk1');
  expect(fetchMock.mock.calls[0][0]).toBe('http://x/functions/v1/chat/handoff');
});
