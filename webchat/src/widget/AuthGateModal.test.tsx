import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthGateModal } from './AuthGateModal';
import type { WebAuth, AuthOutcome } from '../auth/webAuth';
import type { PendingAction } from './WebchatWidget';

const action: PendingAction = { kind: 'book', payload: { slot_at: '2026-08-20T10:00' } };
function fakeAuth(over: Partial<WebAuth> = {}): WebAuth {
  return { login: vi.fn(async () => ({ ok: true as const, patientId: 'p1' })), signup: vi.fn(async () => ({ ok: true as const, patientId: 'p1' })), ...over };
}

test('[WEBMOD-AUTH-02] [로그인]은 기존 로그인 흐름에 연결하고 상담 메시지를 자격 증명으로 쓰지 않는다', async () => {
  const auth = fakeAuth();
  const onAuth = vi.fn();
  render(<AuthGateModal action={action} auth={auth} onClose={() => {}} onAuthenticated={onAuth} />);
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(auth.login).toHaveBeenCalledWith(action);          // action 문맥만 넘김 — 상담 메시지 아님
  await waitFor(() => expect(onAuth).toHaveBeenCalledWith('p1', action));
});

test('[WEBMOD-AUTH-03] [가입]은 기존 가입 흐름에 연결하며 위젯 내부에 OTP·비밀번호 입력칸을 새로 만들지 않는다', async () => {
  const auth = fakeAuth();
  render(<AuthGateModal action={action} auth={auth} onClose={() => {}} onAuthenticated={() => {}} />);
  expect(screen.queryByLabelText(/비밀번호|인증번호|OTP/)).not.toBeInTheDocument(); // 위젯 내부 가입 3화면 없음
  await userEvent.click(screen.getByRole('button', { name: '가입' }));
  expect(auth.signup).toHaveBeenCalledWith(action);
});

test('[WEBMOD-AUTH-04] 처리 중에는 중복 제출과 원래 행동 실행을 막는다', async () => {
  let resolve!: (v: AuthOutcome) => void;
  const auth = fakeAuth({ login: vi.fn(() => new Promise<AuthOutcome>((r) => { resolve = r; })) });
  render(<AuthGateModal action={action} auth={auth} onClose={() => {}} onAuthenticated={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(screen.getByRole('status')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '로그인' })); // 두 번째 클릭 무시(disabled)
  expect(auth.login).toHaveBeenCalledTimes(1);
  resolve({ ok: true, patientId: 'p1' });
});

test('[WEBMOD-AUTH-05] 인증 실패는 성공으로 닫지 않고 한글 오류를 모달 안에 표시하며 익명 상담을 유지한다', async () => {
  const auth = fakeAuth({ login: vi.fn(async () => ({ ok: false as const, message: '전화번호 또는 비밀번호가 올바르지 않습니다' })) });
  const onAuth = vi.fn(); const onClose = vi.fn();
  render(<AuthGateModal action={action} auth={auth} onClose={onClose} onAuthenticated={onAuth} />);
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('올바르지 않습니다');
  expect(onAuth).not.toHaveBeenCalled();  // 성공으로 닫지 않음
  expect(onClose).not.toHaveBeenCalled();
});

test('[WEBMOD-AUTH-06] 닫기는 원래 행동을 실행하지 않고 익명 상담 문맥으로 돌아간다', async () => {
  const onAuth = vi.fn(); const onClose = vi.fn();
  render(<AuthGateModal action={action} auth={fakeAuth()} onClose={onClose} onAuthenticated={onAuth} />);
  await userEvent.click(screen.getByRole('button', { name: '닫기' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onAuth).not.toHaveBeenCalled();  // 원래 예약 행동 실행 안 함
});
