import type { PendingAction } from '../widget/WebchatWidget';

// 로그인/가입은 위젯이 소유하지 않는다 — 병원 홈페이지의 "기존 인증 흐름"에 연결하는 어댑터.
// 위젯 내부에 OTP·가입 화면을 새로 만들지 않는다(WEBMOD-AUTH-03). 프로덕션이 실제 흐름을 주입한다.
export type AuthOutcome =
  | { ok: true; patientId: string }
  | { ok: false; message: string };   // 한글 오류(개발자 오류문 아님)

export interface WebAuth {
  login(action: PendingAction): Promise<AuthOutcome>;
  signup(action: PendingAction): Promise<AuthOutcome>;
}

// 배포가 실제 로그인/가입 흐름에 잇는 팩토리의 자리표시자. 위젯 계약상 자리만 —
// 실제 OTP·가입 화면·SMS는 배포가 이 팩토리를 기존 흐름에 배선한다(WEBMOD-AUTH-03).
// 배선 전엔 사용자에게 개발자 오류가 아니라 한글 안내를 돌려준다.
export function createWebAuth(): WebAuth {
  const notWired: AuthOutcome = { ok: false, message: '로그인 준비 중입니다. 잠시 후 다시 시도해 주세요.' };
  return {
    async login() { return notWired; },
    async signup() { return notWired; },
  };
}
