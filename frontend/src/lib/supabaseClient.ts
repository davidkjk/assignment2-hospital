import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'local-development-key'

/**
 * 인증 이메일 링크의 흐름 종류(`invite`·`recovery`)를 supabase가 URL 조각(#…&type=…)을
 * 지우기 전에 잡아둔다. ⚠️ 반드시 createClient(아래) '전에' 읽어야 한다 — createClient가
 * detectSessionInUrl로 조각을 파싱하고 history에서 지우기 때문.
 * 초대(type=invite)는 복구와 달리 PASSWORD_RECOVERY 이벤트를 내지 않으므로(그냥 SIGNED_IN),
 * "초대로 들어왔다"는 이 값으로만 알 수 있다. 새로고침 대비로 sessionStorage에도 남긴다.
 */
export const authFlowType: string | null = (() => {
  try {
    const fromUrl = new URLSearchParams(window.location.hash.slice(1)).get('type')
    if (fromUrl) {
      sessionStorage.setItem('sb-auth-flow-type', fromUrl)
      return fromUrl
    }
    return sessionStorage.getItem('sb-auth-flow-type')
  } catch {
    return null
  }
})()

/** 초대·복구 비밀번호 설정을 마친 뒤 흐름 표식을 지운다(다음 방문에서 재적용 방지). */
export function clearAuthFlowType(): void {
  try {
    sessionStorage.removeItem('sb-auth-flow-type')
  } catch {
    /* sessionStorage 접근 불가 컨텍스트 — 무시 */
  }
}

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
