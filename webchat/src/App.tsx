import { WebchatApp } from './widget/WebchatApp';
import { createWebchatApi } from './api/webchatApi';
import { createWebAuth } from './auth/webAuth';   // 배포가 실제 흐름에 배선
import { env } from './lib/env';

const api = createWebchatApi(env.supabaseUrl ? `${env.supabaseUrl}/functions/v1` : '');

export default function App() {
  return <WebchatApp api={api} auth={createWebAuth()} hospitalPhone="" />; // hospitalPhone·auth 배선은 배포
}
