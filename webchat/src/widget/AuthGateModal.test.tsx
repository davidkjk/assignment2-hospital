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

test('[WEBMOD-AUTH-03 개정] 가입은 웹에서 만들지 않으므로 [가입] 버튼을 두지 않고 앱 가입 경로만 안내한다(막다른 길 금지)', async () => {
  // ~~옛 WEBMOD-AUTH-03: [가입]→기존 가입 흐름 연결~~ ✅ 해소(2026-09-11, 사용자 결정) — 웹 가입 미구현이라 버튼 제거.
  const auth = fakeAuth();
  render(<AuthGateModal action={action} auth={auth} onClose={() => {}} onAuthenticated={() => {}} />);
  expect(screen.queryByRole('button', { name: '가입' })).not.toBeInTheDocument();       // 오해를 주는 가입 버튼 없음
  expect(screen.queryByLabelText(/비밀번호|인증번호|OTP/)).not.toBeInTheDocument();       // 위젯 내부 가입 화면도 없음
  expect(auth.signup).not.toHaveBeenCalled();
  expect(screen.getByText(/가온병원 앱에서 가입/)).toBeInTheDocument();                    // 계정 없는 분을 앱으로 안내(막다른 길 방지)
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
