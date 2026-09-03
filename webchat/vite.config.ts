import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 병원 홈페이지에 임베드되는 위젯. base는 배포 시점에 확정(Task 14).
  build: { outDir: 'dist' },
  // 로컬 개발용 프록시. 상담봇 백엔드(FastAPI `/chat/*`)를 same-origin으로 부르게 해
  // App.tsx의 빈 baseUrl(상대경로)이 개발에서도 그대로 동작한다(배포는 vercel.json rewrite).
  server: {
    proxy: {
      '/chat': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000', changeOrigin: true },
      // 팝업 로그인 화면이 GET /patient/me로 본인 patientId를 확인한다(same-origin).
      '/patient': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000', changeOrigin: true },
    },
  },
});
