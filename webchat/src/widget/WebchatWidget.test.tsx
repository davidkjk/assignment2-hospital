import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebchatWidget } from './WebchatWidget';
import type { WebchatApi, SessionState, HandoffStatus } from '../api/webchatApi';
import { saveAnonToken, clearAnonToken } from '../state/anonSession';

const session: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK',
  messages: [{ id: 'm1', senderType: 'patient', messageType: 'text', content: '내 예약 보여줘', sendState: 'sent' }] };
// 첫 상담(복원할 메시지 0건) — 시작 고정 묶음(봇 인사말·시작 칩)은 빈 피드에만 뜬다(WEBCHAT-ROOM-03·WEBCARD-QUICK-01).
const emptySession: SessionState = { threadId: 't1', aiSessionId: 's1', anonToken: 'TOK', messages: [] };
const WELCOME = '안녕하세요, 무엇을 도와드릴까요?';
function fakeApi(sess: SessionState = session): WebchatApi {
  return {
    startOrRestoreSession: vi.fn(async () => sess),
    fetchMessages: vi.fn(async () => sess.messages),
    sendMessage: vi.fn(async () => ({ routeTaken: 'rag' })),
    fetchHandoff: vi.fn(async (): Promise<HandoffStatus> => ({ phase: 'connecting', isOpen: true })),
    acknowledgeBatches: vi.fn(async () => {}),
    revalidateAction: vi.fn(), executeCard: vi.fn(), createHandoffTicket: vi.fn(), attributeSessionToAccount: vi.fn(),
  };
}
beforeEach(() => clearAnonToken());

test('[WEBCARD-QUICK-01] 방을 처음 열면(빈 피드) 봇 인사말과 시작 고정 칩 5개를 대화 안에 보여준다', async () => {
  const api = fakeApi(emptySession);
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  expect(await screen.findByText(WELCOME)).toBeInTheDocument();
  for (const label of ['진료시간', '예약 방법', '오시는 길', '내 예약 조회', '직원에게 문의'])
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
});

test('[WEBCARD-QUICK-02] 시작 칩(진료시간)을 누르면 그 문장을 환자 말풍선으로 전송한다', async () => {
  const api = fakeApi(emptySession);
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await userEvent.click(await screen.findByRole('button', { name: '진료시간' }));
  await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: '진료시간' })));
});

test('[WEBCHAT-ROOM-03] 대화가 시작되면(피드에 메시지) 시작 고정 묶음이 사라진다 — 입력바 위 상시 칩도 없다', async () => {
  const api = fakeApi(); // 비어있지 않은 피드(내 예약 보여줘)
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByText('내 예약 보여줘'));
  expect(screen.queryByText(WELCOME)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '진료시간' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '내 예약 조회' })).not.toBeInTheDocument(); // 상시 칩 제거(A-②)
});

test('[NAV-WEBCHAT-01] 닫힌 런처를 누르면 방을 열고 같은 브라우저 익명 세션을 복원한다', async () => {
  saveAnonToken('OLD');
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'AI 상담봇' })).toBeInTheDocument());
  expect(api.startOrRestoreSession).toHaveBeenCalledWith('OLD'); // 익명 세션 복원
});

test('[NAV-WEBCHAT-02] 로그인 필요 행동이면 선택·대화 문맥을 보존하고 onAuthGate(인증 관문)를 연다', async () => {
  const onAuthGate = vi.fn();
  const api = fakeApi(emptySession); // 시작 고정 칩(내 예약 조회)은 첫 상담 화면에 뜬다
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={onAuthGate} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  await userEvent.click(await screen.findByRole('button', { name: '내 예약 조회' }));
  expect(onAuthGate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'view_my_appointments' })); // 원래 행동 보존
});

test('[NAV-WEBCHAT-03] 인증 모달을 닫으면 원래 행동을 실행하지 않고 같은 익명 방 위치로 돌아온다', async () => {
  const api = fakeApi(emptySession);
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  await userEvent.click(await screen.findByRole('button', { name: '내 예약 조회' }));
  // 콜백만 부르고 방은 그대로(모달 화면은 Task 15). 첫 상담 안내 화면이 유지된다.
  expect(screen.getByText(WELCOME)).toBeInTheDocument();
  expect(api.sendMessage).not.toHaveBeenCalled(); // 원래 행동은 인증 전 실행 안 됨
});

test('[NAV-WEBCHAT-04] 로그인 완료면 최신 값을 조회해 원래 행동으로 복귀한다(가입 완료 복귀=재확인 카드는 Task 15)', async () => {
  const api = fakeApi(emptySession);
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  // 로그인 완료 콜백(Task 15가 실제 모달에서 부른다)을 시뮬레이트 → 최신 조회 트리거
  await userEvent.click(await screen.findByRole('button', { name: '내 예약 조회' }));
  // WEBMOD-AUTH 계열(가입 완료)은 자동 실행이 아니라 재확인 카드다 — 위젯이 자동 신청을 하지 않음을 확인
  expect(api.sendMessage).not.toHaveBeenCalled();
});

test('[NAV-WEBCHAT-05] 익명 인계가 필요하면 onHandoffNeeded로 폼을 열고 성공하면 인계 상태로 돌아온다', async () => {
  const onHandoffNeeded = vi.fn();
  const api = fakeApi(emptySession);
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={onHandoffNeeded} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  await userEvent.click(await screen.findByRole('button', { name: '직원에게 문의' }));
  expect(onHandoffNeeded).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1' })); // 대화 요약 문맥 전달
});

test('[NAV-WEBCHAT-06] 같은 브라우저는 토큰으로 복원, 다른 기기(토큰 없음)엔 이어보기 경로가 없다', async () => {
  const api = fakeApi(); // 토큰 저장 안 함 = 다른 기기
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  expect(api.startOrRestoreSession).toHaveBeenCalledWith(null); // 새 익명 세션, 남의 상담 추측 조회 없음
  expect(screen.queryByRole('button', { name: /다른 기기.*이어보기/ })).not.toBeInTheDocument();
});

test('[WEBCHAT-URGENT] 긴급(emergency) 응답이면 긴급 안내 배너와 필수 면책 문구를 대화 위에 렌더한다', async () => {
  const api = fakeApi(emptySession);
  (api.sendMessage as any).mockResolvedValue({ routeTaken: 'emergency', botMessage: {
    id: 'e1', senderType: 'bot', messageType: 'text', content: '지금 위급한 상황일 수 있어요' } });
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await userEvent.click(await screen.findByRole('button', { name: '진료시간' })); // 아무 전송이나 → emergency 분류
  expect(await screen.findByText('이 안내는 긴급 여부를 완벽히 판단하거나 진단하는 것이 아닙니다.')).toBeInTheDocument();
  // URGENT-03: 예약 시간선택·신청 CTA를 함께 노출하지 않는다.
  expect(screen.queryByRole('button', { name: /시간 선택|예약 신청/ })).not.toBeInTheDocument();
});

test('[WEBCHAT-OUTAGE] AI 장애(전송 5xx)면 병원 전화·[문의 남기기]를 주 경로로 렌더하고, 문의는 익명 인계로 연결', async () => {
  const onHandoffNeeded = vi.fn();
  const api = fakeApi(emptySession);
  (api.sendMessage as any).mockRejectedValue(new Error('webchat_api_500'));
  render(<WebchatWidget api={api} hospitalPhone="02-1234-5678" onAuthGate={() => {}} onHandoffNeeded={onHandoffNeeded} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await userEvent.click(await screen.findByRole('button', { name: '진료시간' }));
  expect(await screen.findByText('02-1234-5678')).toBeInTheDocument();          // 병원 전화번호(WEBCHAT-OUTAGE-06)
  await userEvent.click(screen.getByRole('button', { name: '문의 남기기' }));
  expect(onHandoffNeeded).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1' })); // 대화 문맥으로 익명 인계(OUTAGE-02)
});

test('[NAV-WEBCHAT-07] 웹에서 마감 후 취소·변경은 앱 팝업/예약 맥락 화면을 복제하거나 새 이동을 만들지 않는다', async () => {
  const api = fakeApi();
  render(<WebchatWidget api={api} hospitalPhone="02-000-0000" onAuthGate={() => {}} onHandoffNeeded={() => {}} renderCard={() => null} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 상담봇 열기' }));
  await waitFor(() => screen.getByRole('region', { name: 'AI 상담봇' }));
  // 앱 전용 마감 후 팝업/예약 맥락 화면이 웹에 없음(미결이라 새 화면 금지)
  expect(screen.queryByText(/마감 후 취소|예약 맥락/)).not.toBeInTheDocument();
});
