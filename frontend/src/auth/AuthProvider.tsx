import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Role, StaffProfile } from './roles'

export interface SessionLike {
  access_token: string
  user?: { id?: string; email?: string }
}

interface AuthState {
  session: SessionLike | null
  staff: StaffProfile | null
  loading: boolean
  isRecoverySession: boolean
  finishPasswordRecovery(): void
  login(email: string, password: string): Promise<StaffProfile>
  logout(): Promise<void>
  refreshStaff(): Promise<StaffProfile | null>
}

export const AuthContext = createContext<AuthState | null>(null)

type Fetcher = typeof fetch
interface InitialAuth { session: SessionLike; staff: StaffProfile }
type AuthGate = 'ordinary' | 'recovery' | 'reauth'
const RECOVERY_ID_KEY = 'staff-password-recovery-user'
const REAUTH_ID_KEY = 'staff-password-reauth-user'

function sessionUserId(session: SessionLike | null): string | null {
  const value = session?.user?.id
  return typeof value === 'string' && value ? value : null
}

function readRecoveryUserId(): string | null {
  try { return sessionStorage.getItem(RECOVERY_ID_KEY) } catch { return null }
}

function writeRecoveryUserId(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(RECOVERY_ID_KEY, userId)
    else sessionStorage.removeItem(RECOVERY_ID_KEY)
  } catch { /* 브라우저 저장소가 막혀도 메모리 상태로 현재 탭을 보호한다. */ }
}

function readReauthUserId(): string | null {
  try { return sessionStorage.getItem(REAUTH_ID_KEY) } catch { return null }
}

function writeReauthUserId(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(REAUTH_ID_KEY, userId)
    else sessionStorage.removeItem(REAUTH_ID_KEY)
  } catch { /* 브라우저 저장소가 막혀도 현재 렌더의 staff=null 경계는 유지된다. */ }
}

function mapStaff(value: Record<string, unknown>, email = ''): StaffProfile {
  return {
    staffId: String(value.id ?? value.staff_id),
    name: String(value.name ?? ''),
    email: String(value.email ?? email),
    role: value.role as Role,
    departmentId: (value.department_id as string | null) ?? null,
    departmentName: (value.department_name as string | null) ?? null,
  }
}

export function AuthProvider({
  children,
  client = supabase,
  fetcher = fetch,
  initialAuth,
}: {
  children: ReactNode
  client?: SupabaseClient
  fetcher?: Fetcher
  initialAuth?: InitialAuth
}) {
  const [session, setSession] = useState<SessionLike | null>(initialAuth?.session ?? null)
  const [staff, setStaff] = useState<StaffProfile | null>(initialAuth?.staff ?? null)
  const [loading, setLoading] = useState(!initialAuth)
  const [authGate, setAuthGateState] = useState<AuthGate>('ordinary')
  const sessionUserIdRef = useRef(sessionUserId(initialAuth?.session ?? null))
  const authGateRef = useRef<AuthGate>('ordinary')
  const authGateUserIdRef = useRef<string | null>(null)
  const updateSession = useCallback((next: SessionLike | null) => {
    sessionUserIdRef.current = sessionUserId(next)
    setSession(next)
  }, [])
  const setAuthGate = useCallback((nextGate: AuthGate, userId: string | null = null) => {
    const gate = userId ? nextGate : 'ordinary'
    authGateRef.current = gate
    authGateUserIdRef.current = gate === 'ordinary' ? null : userId
    setAuthGateState(gate)
    writeRecoveryUserId(gate === 'recovery' ? userId : null)
    writeReauthUserId(gate === 'reauth' ? userId : null)
  }, [])
  const resolveAuthGate = useCallback((userId: string | null): AuthGate => {
    if (userId && readRecoveryUserId() === userId) return 'recovery'
    if (userId && readReauthUserId() === userId) return 'reauth'
    if (userId && authGateUserIdRef.current === userId) return authGateRef.current
    return 'ordinary'
  }, [])
  const isRecoverySession = authGate === 'recovery'
  const requiresPasswordLogin = authGate !== 'ordinary'

  const loadStaff = useCallback(async (nextSession: SessionLike, email = '') => {
    const response = await fetcher('/me', { headers: { Authorization: `Bearer ${nextSession.access_token}` } })
    if (!response.ok) throw new Error('staff profile unavailable')
    const profile = mapStaff(await response.json() as Record<string, unknown>, email)
    const expectedUserId = sessionUserId(nextSession)
    if (
      authGateRef.current !== 'ordinary'
      || (expectedUserId && sessionUserIdRef.current !== expectedUserId)
    ) {
      throw new Error('stale staff profile')
    }
    setStaff(profile)
    return profile
  }, [fetcher])

  const refreshStaff = useCallback(async () => {
    if (!session || requiresPasswordLogin) return null
    return loadStaff(session, staff?.email)
  }, [loadStaff, requiresPasswordLogin, session, staff?.email])

  useEffect(() => {
    if (initialAuth) return
    let active = true
    let initialTimer: ReturnType<typeof setTimeout> | undefined

    const finishInitialSession = async (next: SessionLike | null) => {
      if (!active) return
      const nextUserId = sessionUserId(next)
      const gate = resolveAuthGate(nextUserId)
      setAuthGate(gate, nextUserId)
      updateSession(next)
      if (gate !== 'ordinary') {
        setStaff(null)
        setLoading(false)
        return
      }
      if (next) {
        try {
          await loadStaff(next, next.user?.email ?? '')
        } catch {
          if (authGateRef.current === 'ordinary' && sessionUserIdRef.current === nextUserId) {
            updateSession(null)
            setStaff(null)
          }
        }
      } else {
        setStaff(null)
      }
      if (active) setLoading(false)
    }

    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
      const next = nextSession as SessionLike | null
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') {
        if (initialTimer !== undefined) clearTimeout(initialTimer)
        const nextUserId = sessionUserId(next)
        setAuthGate('recovery', nextUserId)
        updateSession(next)
        setStaff(null)
        setLoading(false)
        return
      }
      if (event === 'INITIAL_SESSION') {
        if (initialTimer !== undefined) clearTimeout(initialTimer)
        // Supabase는 INITIAL_SESSION 직후 같은 초기화에서 PASSWORD_RECOVERY를
        // 보낼 수 있으므로 한 task 양보해 복구 이벤트가 proof를 선점하게 한다.
        initialTimer = setTimeout(() => { void finishInitialSession(next) }, 0)
        return
      }

      const previousUserId = sessionUserIdRef.current
      updateSession(next)
      if (!next) {
        setAuthGate('ordinary')
        setStaff(null)
        return
      }
      const nextUserId = sessionUserId(next)
      const gate = resolveAuthGate(nextUserId)
      setAuthGate(gate, nextUserId)
      if (gate !== 'ordinary') {
        setStaff(null)
        return
      }
      if (previousUserId !== nextUserId) {
        setStaff(null)
        if (nextUserId) {
          void loadStaff(next, next.user?.email ?? '').catch(() => {
            if (authGateRef.current === 'ordinary' && sessionUserIdRef.current === nextUserId) {
              updateSession(null)
              setStaff(null)
            }
          })
        }
      }
    })
    return () => {
      active = false
      if (initialTimer !== undefined) clearTimeout(initialTimer)
      subscription.subscription.unsubscribe()
    }
  }, [client, initialAuth, loadStaff, resolveAuthGate, setAuthGate, updateSession])

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) throw error ?? new Error('authentication failed')
    const next = data.session as SessionLike
    setAuthGate('ordinary')
    updateSession(next)
    const profile = await loadStaff(next, email)
    return profile
  }, [client, loadStaff, setAuthGate, updateSession])

  const logout = useCallback(async () => {
    await client.auth.signOut()
    setAuthGate('ordinary')
    updateSession(null)
    setStaff(null)
  }, [client, setAuthGate, updateSession])

  const finishPasswordRecovery = useCallback(() => {
    if (authGate !== 'recovery') return
    const userId = sessionUserId(session)
    setAuthGate('reauth', userId)
    setStaff(null)
  }, [authGate, session, setAuthGate])

  const value = useMemo(
    () => ({ session, staff, loading, isRecoverySession, finishPasswordRecovery, login, logout, refreshStaff }),
    [session, staff, loading, isRecoverySession, finishPasswordRecovery, login, logout, refreshStaff],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
