import type { PendingAction } from '../widget/WebchatWidget';

// 로그인/가입은 위젯이 소유하지 않는다 — 병원 기존 인증 흐름에 연결하는 어댑터(WEBMOD-AUTH-02·03).
// 위젯 내부에 OTP·가입 화면을 새로 만들지 않는다. 로그인은 위젯 밖 별도 화면(팝업)에서 처리한다.
export type AuthOutcome =
  | { ok: true; patientId: string }
  | { ok: false; message: string };   // 한글 오류(개발자 오류문 아님)

export interface WebAuth {
  login(action: PendingAction): Promise<AuthOutcome>;
  signup(action: PendingAction): Promise<AuthOutcome>;
}

// 팝업 창의 최소 계약 — createWebAuth가 여는 창(테스트는 스텁으로 대체).
type PopupWindow = { closed: boolean; close: () => void; focus?: () => void } | null;

export interface WebAuthDeps {
  // 팝업을 여는 함수(기본 window.open). 반환 null = 팝업 차단.
  open?: (url: string, target: string, features: string) => PopupWindow;
  // 팝업/메시지의 신뢰 origin(기본 현재 페이지 origin). 다른 origin 메시지는 무시.
  origin?: string;
  // 로그인 성공 시 받은 Supabase 세션을 위젯 클라에 주입(기본 supabase.auth.setSession).
  onSession?: (session: unknown) => void;
}

// 팝업이 opener로 보내는 인증 결과 메시지의 계약(WebAuthPage가 postMessage로 보냄).
type AuthMessage =
  | { source: 'webchat-auth'; ok: true; patientId: string; session?: unknown }
  | { source: 'webchat-auth'; ok: false; message: string };

const AUTH_SOURCE = 'webchat-auth';

export function createWebAuth(deps: WebAuthDeps = {}): WebAuth {
  const open = deps.open ?? ((url, target, features) => window.open(url, target, features) as PopupWindow);
  const origin = deps.origin ?? window.location.origin;
  // 세션 주입은 실제 로그인 성공 시에만 필요 → supabase 클라를 지연 로드(빈 env로 모듈 로드가 깨지지 않게).
  const onSession = deps.onSession ?? ((session: unknown) => {
    void import('../lib/supabaseClient').then(({ supabase }) => supabase.auth.setSession(session as never));
  });

  return {
    login(): Promise<AuthOutcome> {
      const popup = open(`${origin}/?authmode=login`, 'webchat-login', 'width=420,height=680');
      if (!popup) {
        return Promise.resolve({ ok: false, message: '팝업이 차단되어 로그인 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.' });
      }
      return new Promise<AuthOutcome>((resolve) => {
        let done = false;
        const finish = (outcome: AuthOutcome) => {
          if (done) return;
          done = true;
          window.removeEventListener('message', onMessage);
          clearInterval(timer);
          resolve(outcome);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== origin) return;                 // 신뢰 origin만
          const data = event.data as AuthMessage | undefined;
          if (!data || data.source !== AUTH_SOURCE) return;    // 우리 계약만
          if (data.ok) {
            if (data.session !== undefined) onSession(data.session); // 세션을 위젯 클라에 주입
            finish({ ok: true, patientId: data.patientId });
          } else {
            finish({ ok: false, message: data.message });
          }
          try { popup.close(); } catch { /* 이미 닫힘 */ }
        };
        window.addEventListener('message', onMessage);
        // 사용자가 팝업을 그냥 닫으면 메시지가 없다 → closed 폴링으로 취소 감지(WEBMOD-AUTH-06)
        const timer = setInterval(() => {
          if (popup.closed) finish({ ok: false, message: '로그인이 취소되었습니다.' });
        }, 300);
      });
    },
    // 로그인만 지원(사용자 결정). 가입은 위젯에서 만들지 않고 환자 앱으로 안내(WEBMOD-AUTH-03).
    signup(): Promise<AuthOutcome> {
      return Promise.resolve({ ok: false, message: '가입은 가온병원 환자 앱에서 진행해 주세요. 앱에서 가입 후 다시 로그인하실 수 있습니다.' });
    },
  };
}
