import { beforeEach, expect, test, vi } from 'vitest'
import { ApiError } from './httpClient'
import { applyServerEffect, type ServerEffectDeps } from './serverEffects'

beforeEach(() => sessionStorage.clear())

function deps(overrides: Partial<ServerEffectDeps> = {}): ServerEffectDeps {
  return {
    online: true,
    markServerOk: vi.fn(),
    logout: vi.fn(),
    pathname: '/queue',
    staffId: 'staff-1',
    ...overrides,
  }
}

test('[OFFX-STAFF-04] 서버 호출이 성공하면 markServerOk를 부른다', () => {
  const d = deps()
  applyServerEffect('success', null, d)
  expect(d.markServerOk).toHaveBeenCalledOnce()
  expect(d.logout).not.toHaveBeenCalled()
})

test('[OFF-AUTH-04] 온라인 401은 세션 만료 — 돌아올 곳을 남기고 로그아웃한다', () => {
  const d = deps({ online: true })
  applyServerEffect('error', new ApiError('세션이 만료되었습니다.', 401), d)
  expect(d.logout).toHaveBeenCalledOnce()
  expect(JSON.parse(sessionStorage.getItem('staff-session-return')!)).toEqual({
    path: '/queue',
    staffId: 'staff-1',
  })
})

test('[OFF-AUTH-04] 오프라인 중 401은 만료로 보지 않는다 — 로그아웃하지 않는다', () => {
  const d = deps({ online: false })
  applyServerEffect('error', new ApiError('x', 401), d)
  expect(d.logout).not.toHaveBeenCalled()
  expect(sessionStorage.getItem('staff-session-return')).toBeNull()
})

test('[OFF-AUTH-04] 네트워크 실패(status 0)는 로그아웃 트리거가 아니다', () => {
  const d = deps({ online: true })
  applyServerEffect('error', new ApiError('인터넷 연결을 확인해주세요.', 0), d)
  expect(d.logout).not.toHaveBeenCalled()
})

test('[OFFX-STAFF-04] 실패는 markServerOk를 부르지 않는다 — 성공만 새것이다', () => {
  const d = deps()
  applyServerEffect('error', new ApiError('x', 500), d)
  expect(d.markServerOk).not.toHaveBeenCalled()
})
