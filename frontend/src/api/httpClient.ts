import { supabase } from '../lib/supabaseClient'

/**
 * 서버가 준 오류를 그대로 담아 나르는 예외.
 * `message`는 서버 문장을 다시 쓰지 않고 그대로 옮긴다(`ERR-MSG-01`).
 * `status`는 호출부가 세션 만료(온라인 401)와 네트워크 실패를 가를 수 있게 보존한다(`OFF-AUTH-04`).
 */
export class ApiError extends Error {
  readonly status: number
  // 서버가 준 구조화 데이터(errors.py의 `context`) — 화면이 「갈 길」을 그리는 데 쓴다.
  // 예: 정원 초과 409의 { reason: 'over_daily_max', max } (A5) — 「자리 뺏김」과 구분한다.
  readonly context?: unknown
  constructor(message: string, status: number, context?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.context = context
  }
}

// 서버가 문장을 주지 못한 경우(JSON이 아니거나 detail이 빈 경우)에만 쓰는 최후 문구.
// 서버가 detail을 준 순간부터는 이 문구가 끼어들지 않는다(ERR-MSG-01).
const FALLBACK_MESSAGE = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'

// 네트워크 자체가 닿지 못했을 때(오프라인 등). 인증 실패가 아니므로 status는 0으로 둔다.
const NETWORK_ERROR_STATUS = 0

async function authHeader(): Promise<Record<string, string>> {
  // 연결 판정이 아니라 자격 첨부만 한다 — Consumes: supabaseClient.
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function readError(response: Response): Promise<{ message: string; context?: unknown }> {
  try {
    const body = (await response.clone().json()) as { detail?: unknown; context?: unknown }
    const message = typeof body?.detail === 'string' && body.detail ? body.detail : FALLBACK_MESSAGE
    return { message, context: body?.context }
  } catch {
    /* JSON이 아니면 서버 문장이 없는 것으로 본다. */
  }
  return { message: FALLBACK_MESSAGE }
}

/**
 * 모든 서버 호출의 단일 통로. ⭐ 세 가지 금지:
 *  ① 시간제한을 넣지 않는다(`BTN-TIME-01`) — 앱이 임의로 끊으면 「성공했는데 실패로 안내」가 생긴다.
 *  ② 오류 문장을 다시 쓰지 않는다(`ERR-MSG-01`) — 서버 detail을 그대로 ApiError에 담는다.
 *  ③ 네트워크 실패를 401처럼 다루지 않는다(`OFF-AUTH-04`) — status 0으로 구분한다.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = { ...(await authHeader()), ...(options.headers ?? {}) }
  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    throw new ApiError('인터넷 연결을 확인해주세요.', NETWORK_ERROR_STATUS)
  }
  if (!response.ok) {
    const { message, context } = await readError(response)
    throw new ApiError(message, response.status, context)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? (JSON.parse(text) as T) : (undefined as T))
}

const RETURN_KEY = 'staff-session-return'

/**
 * 온라인 401만 진짜 세션 만료다(`OFF-AUTH-04`). 오프라인/네트워크 실패(status 0)나
 * 오프라인 중 받은 401은 만료로 보지 않는다 — 그래야 연결이 자주 끊기는 자리에서 로그아웃되지 않는다.
 */
export function isSessionExpiry(status: number, online: boolean): boolean {
  return status === 401 && online
}

/**
 * 세션 만료로 로그인 화면에 내보낼 때 「돌아올 곳」을 남긴다(`NAV-SHELL-08`·`P-S5`).
 * ⭐ 화면 주소만 남긴다(`NAV-SHELL-08b`) — 검색어·필터·입력하던 내용은 남기지 않는다.
 *   검색어는 대개 환자 이름·전화번호라, 로그아웃된 뒤 공용 PC에 그것이 남으면 안 된다.
 * Task 4가 정한 `{ path, staffId }` 계약·`staff-session-return` 키와 일치시킨다.
 */
export function rememberReturn(pathname: string, staffId: string): void {
  const path = pathname.split('?')[0]
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path, staffId }))
  } catch {
    /* 저장소가 막혀도 흐름은 그대로 로그인으로 이어진다. */
  }
}
