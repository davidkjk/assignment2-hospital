import { WebchatApp } from './widget/WebchatApp';
import { createWebchatApi } from './api/webchatApi';
import { createWebAuth } from './auth/webAuth';   // 배포가 실제 흐름에 배선
import { WebAuthPage, type SignInResult } from './auth/WebAuthPage';
import { env } from './lib/env';

// 상담봇 백엔드는 Supabase Edge Function이 아니라 FastAPI(`chat.py`, `/chat/*`)다.
// 빈 baseUrl = 상대경로 → 배포는 Vercel rewrite, 로컬은 vite proxy가 Railway/:8000로 넘긴다(same-origin).
// getAccessToken: 로그인 성공 시 위젯에 주입된 Supabase 세션(supabase.auth.setSession)의 access token.
// 귀속·재검증·실행은 이 Bearer로 환자 신원을 검증한다(body patientId는 위조 가능 — WEBMOD-AUTH-09).
const api = createWebchatApi(env.apiBaseUrl, {
  getAccessToken: async () => {
    const { supabase } = await import('./lib/supabaseClient');   // 지연 로드(빈 env로 모듈 로드가 깨지지 않게)
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
});

// 팝업 로그인 화면의 프로덕션 어댑터(WebAuthPage는 이 함수들을 주입받아 테스트됨).
async function signIn({ phone, password }: { phone: string; password: string }): Promise<SignInResult> {
  const { supabase } = await import('./lib/supabaseClient');   // 지연 로드(빈 env로 모듈 로드가 깨지지 않게)
  const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
  // 개인정보 열거 방지: 실패 사유를 구분하지 않고 같은 한글 문구로 안내한다.
  if (error || !data.session) return { session: null, error: '전화번호 또는 비밀번호가 올바르지 않습니다.' };
  return { session: data.session, error: null };
}

// 세션 토큰으로 본인 환자 id 확인(GET /patient/me). same-origin 프록시로 백엔드에 닿는다.
async function fetchPatientId(accessToken: string): Promise<string> {
  const resp = await fetch(env.apiBaseUrl + '/patient/me', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`patient_me_${resp.status}`);
  const j = await resp.json();
  return j.id as string;
}

export default function App() {
  // 팝업 진입점: ?authmode=login 이면 위젯 대신 독립 로그인 화면을 띄운다(WEBMOD-AUTH-03).
  if (new URLSearchParams(window.location.search).get('authmode') === 'login') {
    return (
      <WebAuthPage
        signIn={signIn}
        fetchPatientId={fetchPatientId}
        poster={(message, origin) => window.opener?.postMessage(message, origin)}
        closeSelf={() => window.close()}
        targetOrigin={window.location.origin}   // opener도 같은 webchat origin(same-origin 팝업)
      />
    );
  }
  return <WebchatApp api={api} auth={createWebAuth()} hospitalPhone="" />; // hospitalPhone 배선은 배포
}
