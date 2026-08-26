import { http, HttpResponse } from 'msw'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { ApiError, apiFetch, isSessionExpiry, rememberReturn } from './httpClient'
import { createAppointment } from './appointments'

beforeEach(() => sessionStorage.clear())

const emptyBody = {} as never

// 거부된 프라미스에서 던져진 오류만 ApiError로 좁혀 돌려준다.
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error('거부될 줄 알았는데 성공했다')
}

test('[ERR-MSG-01] 서버가 준 문장을 그대로 던진다', async () => {
  // 앱이 다시 쓰면 서버가 아무리 잘 써도 소용이 없고, 서버가 고쳐도 화면은 안 바뀐다.
  server.use(http.post('*/appointments', () =>
    HttpResponse.json({ detail: '이미 예약이 찬 시간입니다. 다른 시간을 골라주세요.' }, { status: 409 })))
  await expect(createAppointment(emptyBody)).rejects.toThrow('이미 예약이 찬 시간입니다. 다른 시간을 골라주세요.')
})

test('[ERR-MSG-01] 서버 문장을 「알 수 없는 오류」로 덮어쓰지 않는다', async () => {
  server.use(http.post('*/appointments', () =>
    HttpResponse.json({ detail: '이미 예약이 찬 시간입니다. 다른 시간을 골라주세요.' }, { status: 409 })))
  const error = await rejection(createAppointment(emptyBody))
  expect(error.message).not.toMatch(/알 수 없는 오류/)
})

test('[ERR-MSG-01] 실패는 ApiError로 던진다', async () => {
  server.use(http.post('*/appointments', () => HttpResponse.json({ detail: 'x' }, { status: 409 })))
  const error = await rejection(createAppointment(emptyBody))
  expect(error).toBeInstanceOf(ApiError)
})

test('[ERR-MSG-01] ApiError는 서버 상태 코드를 보존한다', async () => {
  server.use(http.post('*/appointments', () => HttpResponse.json({ detail: 'x' }, { status: 409 })))
  const error = await rejection(createAppointment(emptyBody))
  expect(error.status).toBe(409)
})

test('[BTN-TIME-01] 요청에 시간제한을 두지 않는다', () => {
  // 앱이 임의로 끊으면 「성공했는데 실패로 안내」가 생기고, 멱등성이 없어(갭 #15) 예약이 두 건이 된다.
  const source = readFileSync(resolve(process.cwd(), 'src/api/httpClient.ts'), 'utf8')
  expect(source).not.toMatch(/AbortSignal\.timeout|setTimeout\([^)]*abort/i)
})

test('[OFF-AUTH-04] 오프라인(네트워크 실패) 401은 세션 만료가 아니다', () => {
  // 네트워크 실패와 인증 실패를 구분해야 한다 — 오프라인 401을 만료로 처리하면 하루 종일 로그아웃된다.
  expect(isSessionExpiry(401, false)).toBe(false)
})

test('[OFF-AUTH-04] 온라인 401만 세션 만료로 본다', () => {
  expect(isSessionExpiry(401, true)).toBe(true)
})

test('[OFF-AUTH-04] 네트워크 실패는 ApiError로 던진다', async () => {
  server.use(http.get('*/today/summary', () => HttpResponse.error()))
  const error = await rejection(apiFetch('/today/summary'))
  expect(error).toBeInstanceOf(ApiError)
})

test('[OFF-AUTH-04] 네트워크 실패 status는 0이라 401 만료로 안 걸린다', async () => {
  server.use(http.get('*/today/summary', () => HttpResponse.error()))
  const error = await rejection(apiFetch('/today/summary'))
  expect(error.status).toBe(0)
})

test('[NAV-SHELL-08][P-S5] 401로 내보낼 때 화면 주소와 직원 id를 기억한다', () => {
  // apiFetch는 ApiError를 throw할 뿐이라 돌아올 곳이 사라진다(P-S5). Task 4 계약대로 { path, staffId }를 남긴다.
  rememberReturn('/queue', 's1')
  expect(JSON.parse(sessionStorage.getItem('staff-session-return') ?? 'null')).toEqual({ path: '/queue', staffId: 's1' })
})

test('[NAV-SHELL-08b] 쿼리스트링은 떼고 화면 주소만 남긴다', () => {
  rememberReturn('/queue?tab=진료대기', 's1')
  expect(JSON.parse(sessionStorage.getItem('staff-session-return') ?? 'null').path).toBe('/queue')
})

test('[NAV-SHELL-08b] 검색어(환자 이름)를 기억에 남기지 않는다', () => {
  // 검색어는 대개 환자 이름·전화번호라, 로그아웃된 뒤에도 브라우저가 그것을 들고 있으면 안 된다.
  rememberReturn('/patients?q=김환자', 's1')
  expect(sessionStorage.getItem('staff-session-return')).not.toMatch(/김환자/)
})
