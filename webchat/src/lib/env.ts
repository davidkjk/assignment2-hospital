// 위젯 런타임 설정. 값이 없으면 빈 문자열이 아니라 화면(Task 14)이 장애 안내를 띄운다.
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  // 상담봇 백엔드(FastAPI `chat.py`, `/chat/*`)의 주소. 비우면 상대경로로 부르고,
  // 배포는 Vercel rewrite가·로컬은 vite proxy가 이를 Railway/:8000으로 넘긴다(same-origin → CORS 불필요).
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  // 홈페이지(호스트) origin — iframe postMessage의 신뢰 대상. 비우면 개발/단독용(수신 무검증·발신은 '*').
  // 배포(Task 6)는 홈페이지 배포 origin으로 고정해 host:setOpen을 그 origin에서만 받는다.
  hostOrigin: import.meta.env.VITE_HOST_ORIGIN ?? '',
};
