import { WebchatApp } from './widget/WebchatApp';
import { createWebchatApi } from './api/webchatApi';
import { createWebAuth } from './auth/webAuth';   // 배포가 실제 흐름에 배선
import { env } from './lib/env';

// 상담봇 백엔드는 Supabase Edge Function이 아니라 FastAPI(`chat.py`, `/chat/*`)다.
// 빈 baseUrl = 상대경로 → 배포는 Vercel rewrite, 로컬은 vite proxy가 Railway/:8000로 넘긴다(same-origin).
const api = createWebchatApi(env.apiBaseUrl);

export default function App() {
  return <WebchatApp api={api} auth={createWebAuth()} hospitalPhone="" />; // hospitalPhone·auth 배선은 배포
}
