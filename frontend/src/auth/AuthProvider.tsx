import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Role, StaffProfile } from './roles'

export interface SessionLike { access_token: string }

interface AuthState {
  session: SessionLike | null
  staff: StaffProfile | null
  loading: boolean
  login(email: string, password: string): Promise<StaffProfile>
  logout(): Promise<void>
  refreshStaff(): Promise<StaffProfile | null>
}

export const AuthContext = createContext<AuthState | null>(null)

type Fetcher = typeof fetch
interface InitialAuth { session: SessionLike; staff: StaffProfile }

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

  const loadStaff = useCallback(async (nextSession: SessionLike, email = '') => {
    const response = await fetcher('/me', { headers: { Authorization: `Bearer ${nextSession.access_token}` } })
    if (!response.ok) throw new Error('staff profile unavailable')
    const profile = mapStaff(await response.json() as Record<string, unknown>, email)
    setStaff(profile)
    return profile
  }, [fetcher])

  const refreshStaff = useCallback(async () => {
    if (!session) return null
    return loadStaff(session, staff?.email)
  }, [loadStaff, session, staff?.email])

  useEffect(() => {
    if (initialAuth) return
    let active = true
    client.auth.getSession().then(async ({ data }) => {
      if (!active) return
      const next = data.session as SessionLike | null
      setSession(next)
      if (next) {
        const sessionEmail = data.session?.user?.email ?? ''
        try { await loadStaff(next, sessionEmail) } catch { setSession(null); setStaff(null) }
      }
      if (active) setLoading(false)
    })
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession as SessionLike | null)
      if (!nextSession) setStaff(null)
    })
    return () => { active = false; subscription.subscription.unsubscribe() }
  }, [client, initialAuth, loadStaff])

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) throw error ?? new Error('authentication failed')
    const next = data.session as SessionLike
    const profile = await loadStaff(next, email)
    setSession(next)
    return profile
  }, [client, loadStaff])

  const logout = useCallback(async () => {
    await client.auth.signOut()
    setSession(null)
    setStaff(null)
  }, [client])

  const value = useMemo(() => ({ session, staff, loading, login, logout, refreshStaff }), [session, staff, loading, login, logout, refreshStaff])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
