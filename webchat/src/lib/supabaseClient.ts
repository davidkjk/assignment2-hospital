import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// 익명 웹 채널. 로그인 세션이 아니라 브라우저 익명 토큰(Task 3·15)으로 소유권을 잇는다.
// persistSession=false: 익명 위젯은 Supabase Auth 세션을 저장하지 않는다(MR2-01).
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
