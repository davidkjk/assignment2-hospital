import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebAuthPage } from './WebAuthPage';
import type { SignInResult } from './WebAuthPage';

const TARGET = 'https://webchat.test';

function deps(over: Partial<Parameters<typeof WebAuthPage>[0]> = {}) {
  return {
    signIn: vi.fn(async (): Promise<SignInResult> => ({ session: { access_token: 'tok' }, error: null })),
    fetchPatientId: vi.fn(async () => 'pat-9'),
    poster: vi.fn(),
    closeSelf: vi.fn(),
    targetOrigin: TARGET,
    ...over,
  };
}

test('[SP1] 전화번호·비밀번호 입력칸과 로그인 버튼을 렌더한다(채팅 메시지 아님)', () => {
  render(<WebAuthPage {...deps()} />);
  expect(screen.getByLabelText(/전화번호/)).toBeInTheDocument();
  expect(screen.getByLabelText(/비밀번호/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
});

test('[SP1] 로그인 성공 → E164 전화로 signIn·patientId 조회·opener로 성공 postMessage·창 닫기', async () => {
  const d = deps();
  render(<WebAuthPage {...d} />);
  await userEvent.type(screen.getByLabelText(/전화번호/), '010-1234-5678');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'demo1234');
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));

  await waitFor(() => expect(d.closeSelf).toHaveBeenCalled());
  expect(d.signIn).toHaveBeenCalledWith({ phone: '+821012345678', password: 'demo1234' }); // 국제표기 정규화
  expect(d.fetchPatientId).toHaveBeenCalledWith('tok');                                     // 세션 토큰으로 본인 확인
  expect(d.poster).toHaveBeenCalledWith(
    { source: 'webchat-auth', ok: true, patientId: 'pat-9', session: { access_token: 'tok' } },
    TARGET,
  );
});

test('[SP1][WEBMOD-AUTH-05] 로그인 실패 → 한글 오류 표시, 성공 postMessage 없음, 재시도 가능', async () => {
  const d = deps({ signIn: vi.fn(async (): Promise<SignInResult> => ({ session: null, error: '전화번호 또는 비밀번호가 올바르지 않습니다' })) });
  render(<WebAuthPage {...d} />);
  await userEvent.type(screen.getByLabelText(/전화번호/), '010-0000-0000');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('올바르지 않습니다');
  expect(d.poster).not.toHaveBeenCalled();
  expect(d.closeSelf).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled(); // 재시도 경로
});

test('[SP1][WEBMOD-AUTH-04] 처리 중에는 중복 제출을 막는다', async () => {
  let resolve!: (v: SignInResult) => void;
  const d = deps({ signIn: vi.fn(() => new Promise<SignInResult>((r) => { resolve = r; })) });
  render(<WebAuthPage {...d} />);
  await userEvent.type(screen.getByLabelText(/전화번호/), '010-1234-5678');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'demo1234');
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  await userEvent.click(screen.getByRole('button', { name: '로그인' })); // 두 번째 무시
  expect(d.signIn).toHaveBeenCalledTimes(1);
  resolve({ session: { access_token: 'tok' }, error: null });
});
