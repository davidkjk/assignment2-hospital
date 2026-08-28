/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { defineConfig } from 'vite'

// 데모/개발용 프록시. 백엔드 API 경로 상당수가 SPA 라우트와 겹친다(/queue·/calendar·/messages·
// /admin/settings 등). apiFetch는 상대경로 fetch(Accept: */*)라, 브라우저 페이지 이동(Accept: text/html)만
// SPA로 되돌리고 나머지 fetch/XHR은 백엔드(:8000)로 보낸다. same-origin이라 CORS도 불필요.
const API_SEGMENTS =
  'admin|appointments|audit|auth|calendar|doctor|doctors|error-logs|health|me|medical-records|messages|patients|queue|schedule|staff|stats|today'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 데모(`demo/`)에서 화면을 통째로 들여올 때 import 경로를 손대지 않기 위한 별칭.
  // 데모 staff 코드의 외부 의존은 react·react-router-dom·`@/components/icons` 셋뿐이다.
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    proxy: {
      [`^/(${API_SEGMENTS})([/?]|$)`]: {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass(req) {
          // 브라우저 페이지 이동(HTML 문서 요청)은 백엔드로 보내지 않고 SPA가 받게 한다.
          if ((req.headers.accept || '').includes('text/html')) return '/index.html'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
