import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'local-development-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** 스토리지 상대경로(`/storage/v1/object/...`)를 Supabase 호스트로 절대화한다.
 *  staff.photo_url·사진 업로드 응답이 상대경로라, 상대경로 그대로 <img src>에 넣으면
 *  브라우저가 현재 페이지 주소(vite dev·배포 도메인) 기준으로 찾아 깨진다. 렌더 직전에 붙인다.
 *  이미 절대 URL(http…)·data:·blob:이면 그대로 둔다. */
export function photoSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return `${supabaseUrl}${path.startsWith('/') ? '' : '/'}${path}`
}
