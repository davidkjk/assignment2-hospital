import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // 더미 Supabase 값 — 위젯이 supabaseClient(realtime presence 등)를 import할 때 createClient가
    // 빈 URL로 던지지 않게 한다(테스트 전용, 실제 접속은 jsdom에서 일어나지 않는다).
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
