import { createWebAuth } from './webAuth';
import type { AuthOutcome } from './webAuth';
import type { PendingAction } from '../widget/WebchatWidget';

const ORIGIN = 'https://webchat.test';
const action: PendingAction = { kind: 'view_my_appointments' };

// 최소한의 팝업 창 스텁 — createWebAuth가 열고, 닫고, closed를 폴링한다.
function fakePopup() {
  return { closed: false, close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }), focus: vi.fn() };
}

// opener로 보내는 인증 결과 메시지(WebAuthPage가 postMessage로 보내는 계약).
function postAuthMessage(data: unknown, origin = ORIGIN) {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

test('[SP1] login()은 팝업을 열고, 팝업이 성공 메시지를 보내면 patientId로 resolve한다', async () => {
  const popup = fakePopup();
  const open = vi.fn((_url: string, _target: string, _features: string) => popup);
  const auth = createWebAuth({ open, origin: ORIGIN });

  const pending = auth.login(action);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[0][0]).toContain('authmode=login'); // 위젯 밖 별도 로그인 화면(WEBMOD-AUTH-03)

  postAuthMessage({ source: 'webchat-auth', ok: true, patientId: 'pat-42' });
  const outcome = await pending;
  expect(outcome).toEqual({ ok: true, patientId: 'pat-42' });
  expect(popup.close).toHaveBeenCalled(); // 완료 후 팝업 닫음
});

test('[SP1][WEBMOD-AUTH-05] login()은 팝업이 실패 메시지를 보내면 한글 오류로 resolve한다(성공으로 닫지 않음)', async () => {
  const popup = fakePopup();
  const auth = createWebAuth({ open: () => popup, origin: ORIGIN });

  const pending = auth.login(action);
  postAuthMessage({ source: 'webchat-auth', ok: false, message: '전화번호 또는 비밀번호가 올바르지 않습니다' });
  const outcome = await pending;
  expect(outcome).toEqual({ ok: false, message: '전화번호 또는 비밀번호가 올바르지 않습니다' });
});

test('[SP1] login()은 다른 origin·다른 source의 메시지를 무시한다(자격 오인 방지)', async () => {
  const popup = fakePopup();
  const auth = createWebAuth({ open: () => popup, origin: ORIGIN });

  const pending = auth.login(action);
  postAuthMessage({ source: 'webchat-auth', ok: true, patientId: 'evil' }, 'https://evil.test'); // 다른 origin
  postAuthMessage({ source: 'other-widget', ok: true, patientId: 'evil2' });                      // 다른 source
  postAuthMessage({ source: 'webchat-auth', ok: true, patientId: 'pat-7' });                      // 진짜
  const outcome = await pending;
  expect(outcome).toEqual({ ok: true, patientId: 'pat-7' });
});

test('[SP1][WEBMOD-AUTH-06] login()은 팝업이 그냥 닫히면 취소로 resolve한다(대화 문맥 유지)', async () => {
  vi.useFakeTimers();
  try {
    const popup = fakePopup();
    const auth = createWebAuth({ open: () => popup, origin: ORIGIN });
    const pending = auth.login(action);

    popup.closed = true;           // 사용자가 팝업을 직접 닫음(메시지 없음)
    await vi.advanceTimersByTimeAsync(500);
    const outcome = await pending;
    expect(outcome).toEqual({ ok: false, message: '로그인이 취소되었습니다.' });
  } finally {
    vi.useRealTimers();
  }
});

test('[SP1] login()은 성공 메시지의 세션을 onSession으로 전달한다(위젯 클라 주입)', async () => {
  const popup = fakePopup();
  const onSession = vi.fn();
  const auth = createWebAuth({ open: () => popup, origin: ORIGIN, onSession });

  const pending = auth.login(action);
  const session = { access_token: 'tok', refresh_token: 'ref' };
  postAuthMessage({ source: 'webchat-auth', ok: true, patientId: 'pat-1', session });
  await pending;
  expect(onSession).toHaveBeenCalledWith(session);
});

test('[SP1] login()은 팝업이 차단되면(null) 한글 안내로 resolve한다', async () => {
  const auth = createWebAuth({ open: () => null, origin: ORIGIN });
  const outcome = await auth.login(action);
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.message).toMatch(/팝업/);
});

test('[SP1][WEBMOD-AUTH-03] signup()은 팝업을 열지 않고 앱 가입 안내 메시지를 돌려준다(로그인만)', async () => {
  const open = vi.fn();
  const auth = createWebAuth({ open, origin: ORIGIN });
  const outcome: AuthOutcome = await auth.signup(action);
  expect(open).not.toHaveBeenCalled();
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.message).toMatch(/앱/);
});
