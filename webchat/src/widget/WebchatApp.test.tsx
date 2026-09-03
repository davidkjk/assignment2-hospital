import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebchatApp } from './WebchatApp';
import type { WebchatApi, SessionState } from '../api/webchatApi';
import type { WebAuth } from '../auth/webAuth';
import { clearAnonToken } from '../state/anonSession';

const bookConfirmPayload = { card_type: 'booking_confirm', patient_name: '홍길동', department_name: '내과', doctor_name: '김의사', slot_at: '2026-08-20T10:00', button: '예약 신청하기', state: '정상' };

function fakeApi(over: Partial<WebchatApi> = {}): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => ({ threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] })),
    fetchMessages: vi.fn(async () => []), sendMessage: vi.fn(async () => ({ routeTaken: 'rag' })),
    fetchHandoff: vi.fn(async () => ({ phase: null, isOpen: true })), acknowledgeBatches: vi.fn(async () => {}),
    revalidateAction: vi.fn(async () => ({ card: { id: 'c1', senderType: 'bot', messageType: 'card', content: null, payload: { ...bookConfirmPayload } } })),
    executeCard: vi.fn(async () => ({ result: { id: 'd1', senderType: 'bot', messageType: 'card', content: null, payload: { card_type: 'booking_done', headline: '예약이 신청되었습니다', number_label: '신청번호', number: 'A-1' } } })),
    createHandoffTicket: vi.fn(async () => ({ ticketId: 'tk1' })),
    attributeSessionToAccount: vi.fn(async () => {}),
    ...over,
  } as unknown as WebchatApi;
}
function fakeAuth(): WebAuth { return { login: vi.fn(async () => ({ ok: true as const, patientId: 'p1' })), signup: vi.fn(async () => ({ ok: true as const, patientId: 'p1' })) }; }

// 방이 열리면 바깥 마운트 region과 안쪽 방 region이 같은 이름이라(중첩) 고유한 닫기 버튼으로 대기한다.
async function openRoom() { await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' })); await waitFor(() => screen.getByRole('button', { name: '닫기' })); }

beforeEach(() => clearAnonToken());

test('[WEBMOD-AUTH-01] 로그인 필요 행동을 누르면 관문 모달을 열고 원래 행동·익명 문맥을 보존한다(자동 실행 없음)', async () => {
  const api = fakeApi();
  render(<WebchatApp api={api} auth={fakeAuth()} hospitalPhone="02-0-0" />);
  await openRoom();
  await userEvent.click(screen.getByRole('button', { name: '내 예약 조회' }));
  expect(screen.getByRole('dialog', { name: '로그인 또는 가입' })).toBeInTheDocument();
  expect(api.executeCard).not.toHaveBeenCalled();     // 인증 전 원래 행동 실행 없음
});

test('[WEBMOD-AUTH-07] 로그인 완료는 최신 서버 값을 조회하고 예약 실행은 확인 단계를 건너뛰지 않는다', async () => {
  const api = fakeApi();
  render(<WebchatApp api={api} auth={fakeAuth()} hospitalPhone="02-0-0" />);
  await openRoom();
  await userEvent.click(screen.getByRole('button', { name: '내 예약 조회' }));
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(api.revalidateAction).toHaveBeenCalledWith({ action: { kind: 'view_my_appointments' } })); // 최신 조회
  expect(api.executeCard).not.toHaveBeenCalled();     // 확인 단계 안 건너뜀
});

test('[WEBMOD-AUTH-08] 가입 완료는 재확인 카드를 다시 표시하고 인증만으로 자동 실행하지 않는다', async () => {
  // 익명 세션에 예약확인 카드가 떠 있는 상태에서 [예약 신청하기] → 관문 → [가입] → 재확인 카드
  const api = fakeApi({ startOrRestoreSession: vi.fn(async (): Promise<SessionState> => ({
    threadId: 't1', aiSessionId: 's1', anonToken: 'TOK',
    messages: [{ id: 'm1', senderType: 'bot', messageType: 'card', content: null, payload: { ...bookConfirmPayload } }],
  })) });
  render(<WebchatApp api={api} auth={fakeAuth()} hospitalPhone="02-0-0" />);
  await openRoom();
  await userEvent.click(await screen.findByRole('button', { name: '예약 신청하기' })); // 익명 카드 → 관문
  await userEvent.click(screen.getByRole('button', { name: '가입' }));           // 가입 완료
  expect(await screen.findByRole('dialog', { name: '예약 재확인' })).toBeInTheDocument(); // 재확인 카드 재표시
  expect(api.executeCard).not.toHaveBeenCalled(); // 인증만으로 자동 신청 없음([신청] 눌러야 확정)
});

test('[SP1] ⑦(귀속·재검증) 라우트가 아직 404여도 로그인 자체는 성공으로 처리해 관문을 닫는다', async () => {
  // SP1은 ⑦(chat/attribute·cards/revalidate) 없이 선다 — 그 호출이 던져도 로그인 실패로 보이지 않아야.
  const api = fakeApi({
    attributeSessionToAccount: vi.fn(async () => { throw new Error('webchat_api_404'); }),
    revalidateAction: vi.fn(async () => { throw new Error('webchat_api_404'); }),
  });
  render(<WebchatApp api={api} auth={fakeAuth()} hospitalPhone="02-0-0" />);
  await openRoom();
  await userEvent.click(screen.getByRole('button', { name: '내 예약 조회' }));
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '로그인 또는 가입' })).not.toBeInTheDocument());
});

test('[WEBMOD-AUTH-09] 명시적 로그인 성공 시에만 앞선 익명 이력을 계정에 귀속한다', async () => {
  const api = fakeApi();
  render(<WebchatApp api={api} auth={fakeAuth()} hospitalPhone="02-0-0" />);
  await openRoom();
  expect(api.attributeSessionToAccount).not.toHaveBeenCalled(); // 인증 전엔 귀속 없음(유사성 추측 금지)
  await userEvent.click(screen.getByRole('button', { name: '내 예약 조회' }));
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(api.attributeSessionToAccount).toHaveBeenCalledWith({ patientId: 'p1' }));
});
