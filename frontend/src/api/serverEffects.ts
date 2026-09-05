import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ApiError, isSessionExpiry, rememberReturn } from './httpClient'
import { useConnectivity } from '../lib/connectivity'
import { useAuth } from '../auth/useAuth'
import { queryClient } from '../lib/queryClient'

/**
 * ⭐ 연결·세션 배선의 단일 지점. 모든 서버 호출은 react-query를 지나므로, 캐시 이벤트 한 곳에서만
 *    ①성공 → markServerOk ②온라인 401 → 세션 만료 처리를 건다. 화면마다 따로 걸면 규칙이 갈라진다.
 */
export interface ServerEffectDeps {
  online: boolean
  markServerOk: () => void
  logout: () => void | Promise<void>
  pathname: string
  staffId: string
}

/**
 * 서버 호출 하나의 결말(성공/실패)을 받아 배선을 실행한다(순수 — react 없이 테스트된다).
 *  - 성공: markServerOk (성공했을 때만 새것이다, `OFFX-STAFF-04`).
 *  - 온라인 401: 진짜 세션 만료 → 돌아올 곳을 남기고 로그아웃(`OFF-AUTH-04`).
 *    오프라인/네트워크 실패(status 0)·오프라인 중 401은 만료로 보지 않는다.
 */
export function applyServerEffect(
  outcome: 'success' | 'error',
  error: unknown,
  deps: ServerEffectDeps,
): void {
  if (outcome === 'success') {
    deps.markServerOk()
    return
  }
  if (error instanceof ApiError && isSessionExpiry(error.status, deps.online)) {
    rememberReturn(deps.pathname, deps.staffId)
    void deps.logout()
  }
}

/**
 * react-query 캐시(쿼리·뮤테이션)를 구독해 매 서버 호출의 결말을 applyServerEffect로 보낸다.
 * 셸 안에 한 번만 마운트한다(useConnectivity·useAuth·useLocation이 필요하므로 라우터·프로바이더 안).
 */
export function ServerEffects(): null {
  const { online, markServerOk } = useConnectivity()
  const { logout, staff } = useAuth()
  const location = useLocation()

  useEffect(() => {
    const deps = (): ServerEffectDeps => ({
      online,
      markServerOk,
      logout,
      pathname: location.pathname,
      staffId: staff?.staffId ?? '',
    })

    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const status = event.action?.type
      if (status === 'success') applyServerEffect('success', null, deps())
      else if (status === 'error') applyServerEffect('error', event.action.error, deps())
    })

    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const state = event.mutation?.state
      if (state?.status === 'success') applyServerEffect('success', null, deps())
      else if (state?.status === 'error') applyServerEffect('error', state.error, deps())
    })

    return () => {
      unsubQueries()
      unsubMutations()
    }
  }, [online, markServerOk, logout, location.pathname, staff])

  return null
}
