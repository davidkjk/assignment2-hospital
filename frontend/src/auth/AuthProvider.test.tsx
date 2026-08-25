import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const RECOVERY_ID_KEY = 'staff-password-recovery-user'
const REAUTH_ID_KEY = 'staff-password-reauth-user'

interface SessionStub {
  access_token: string
  user: { id: string; email: string }
}

type AuthEvent = 'INITIAL_SESSION' | 'PASSWORD_RECOVERY' | 'SIGNED_IN'
type AuthListener = (event: AuthEvent, session: SessionStub | null) => void

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function makeClient(initialEvent: AuthEvent, initialSession: SessionStub, loginSession = initialSession) {
  const listeners: AuthListener[] = []
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: initialSession } }),
    onAuthStateChange: vi.fn((listener: AuthListener) => {
      listeners.push(listener)
      queueMicrotask(() => listener(initialEvent, initialSession))
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session: loginSession },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  }
  return { client: { auth } as unknown as SupabaseClient, auth, listeners }
}

function staffResponse(email = 'kim@hospital.kr', id = 'staff-1') {
  return {
    ok: true,
    json: async () => ({
      id,
      name: '김직원',
      email,
      role: 'receptionist',
      department_id: null,
      department_name: null,
    }),
  } as Response
}

function AuthProbe() {
  const auth = useAuth()
  const extended = auth as typeof auth & {
    isRecoverySession?: boolean
    finishPasswordRecovery?(): void
  }
  return (
    <>
      <p data-testid="auth-state">
        {auth.loading ? 'loading' : 'ready'}:{extended.isRecoverySession ? 'recovery' : 'ordinary'}:{auth.staff ? 'staff' : 'no-staff'}:{auth.staff?.email ?? 'no-email'}
      </p>
      <button type="button" onClick={() => void auth.login('kim@hospital.kr', 'new-password1')}>다시 로그인</button>
      <button type="button" onClick={() => extended.finishPasswordRecovery?.()}>복구 완료</button>
      <button type="button" onClick={() => void auth.refreshStaff()}>프로필 새로고침</button>
    </>
  )
}

describe('직원 복구 세션 경계', () => {
  beforeEach(() => sessionStorage.clear())

  test('[STAFF-LOGIN-10] PASSWORD_RECOVERY 이벤트 세션은 직원 프로필로 승격하지 않는다', async () => {
    const session = { access_token: 'recovery-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const { client } = makeClient('PASSWORD_RECOVERY', session)
    const fetcher = vi.fn().mockResolvedValue(staffResponse())

    render(<AuthProvider client={client} fetcher={fetcher}><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:recovery:no-staff'))
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('[STAFF-LOGIN-10] 새로고침으로 복구 이벤트를 놓쳐도 같은 사용자 proof를 복원한다', async () => {
    sessionStorage.setItem(RECOVERY_ID_KEY, 'user-1')
    const session = { access_token: 'refreshed-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const { client } = makeClient('INITIAL_SESSION', session)
    const fetcher = vi.fn().mockResolvedValue(staffResponse())

    render(<AuthProvider client={client} fetcher={fetcher}><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:recovery:no-staff'))
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('[STAFF-LOGIN-11] 저장된 recovery proof와 세션 사용자가 다르면 proof를 버린다', async () => {
    sessionStorage.setItem(RECOVERY_ID_KEY, 'user-1')
    const session = { access_token: 'ordinary-token', user: { id: 'user-2', email: 'lee@hospital.kr' } }
    const { client } = makeClient('INITIAL_SESSION', session)

    render(<AuthProvider client={client} fetcher={vi.fn().mockResolvedValue(staffResponse())}><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff'))
    expect(sessionStorage.getItem(RECOVERY_ID_KEY)).toBeNull()
  })

  test('[AUTH-PWNEW-04] 명시적 비밀번호 로그인 뒤에만 일반 직원 세션으로 승격한다', async () => {
    sessionStorage.setItem(RECOVERY_ID_KEY, 'user-1')
    const session = { access_token: 'recovery-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const loginSession = { access_token: 'login-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const { client, auth } = makeClient('INITIAL_SESSION', session, loginSession)
    const user = userEvent.setup()

    render(<AuthProvider client={client} fetcher={vi.fn().mockResolvedValue(staffResponse())}><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:recovery:no-staff'))

    await user.click(screen.getByRole('button', { name: '다시 로그인' }))

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff'))
    expect(auth.signInWithPassword).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(RECOVERY_ID_KEY)).toBeNull()
    expect(sessionStorage.getItem(REAUTH_ID_KEY)).toBeNull()
  })

  test('[AUTH-PWNEW-04] 복구 완료 뒤에는 reset 권한만 닫고 새로고침에도 재로그인을 요구한다', async () => {
    const session = { access_token: 'recovery-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const first = makeClient('PASSWORD_RECOVERY', session)
    const user = userEvent.setup()
    const firstView = render(
      <AuthProvider client={first.client} fetcher={vi.fn().mockResolvedValue(staffResponse())}><AuthProbe /></AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:recovery:no-staff'))

    await user.click(screen.getByRole('button', { name: '복구 완료' }))

    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:no-staff')
    expect(sessionStorage.getItem(RECOVERY_ID_KEY)).toBeNull()
    expect(sessionStorage.getItem(REAUTH_ID_KEY)).toBe('user-1')

    firstView.unmount()
    const refreshed = makeClient('INITIAL_SESSION', session)
    const fetcher = vi.fn().mockResolvedValue(staffResponse())
    render(<AuthProvider client={refreshed.client} fetcher={fetcher}><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:no-staff'))
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('[STAFF-LOGIN-11] 일반 세션은 복구 완료 전환을 만들 수 없다', async () => {
    const session = { access_token: 'ordinary-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const { client } = makeClient('INITIAL_SESSION', session)
    const user = userEvent.setup()
    render(<AuthProvider client={client} fetcher={vi.fn().mockResolvedValue(staffResponse())}><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff'))

    await user.click(screen.getByRole('button', { name: '복구 완료' }))

    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff')
    expect(sessionStorage.getItem(REAUTH_ID_KEY)).toBeNull()
  })

  test('[AUTH-PWNEW-04] 복구 완료 뒤 명시적 로그인 전에는 프로필 새로고침도 승격하지 않는다', async () => {
    const session = { access_token: 'recovery-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const { client } = makeClient('PASSWORD_RECOVERY', session)
    const fetcher = vi.fn().mockResolvedValue(staffResponse())
    const user = userEvent.setup()
    render(<AuthProvider client={client} fetcher={fetcher}><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:recovery:no-staff'))

    await user.click(screen.getByRole('button', { name: '복구 완료' }))
    await user.click(screen.getByRole('button', { name: '프로필 새로고침' }))

    expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:no-staff')
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('[STAFF-LOGIN-11] auth 세션 사용자가 바뀌면 이전 직원 프로필을 유지하지 않는다', async () => {
    const firstSession = { access_token: 'token-1', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const secondSession = { access_token: 'token-2', user: { id: 'user-2', email: 'lee@hospital.kr' } }
    const { client, listeners } = makeClient('INITIAL_SESSION', firstSession)
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      return authorization === 'Bearer token-2'
        ? staffResponse('lee@hospital.kr', 'staff-2')
        : staffResponse()
    })
    render(<AuthProvider client={client} fetcher={fetcher}><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff:kim@hospital.kr'))

    act(() => listeners[0]('SIGNED_IN', secondSession))

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff:lee@hospital.kr'))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test('[STAFF-LOGIN-11] 이전 사용자의 늦은 me 응답이 새 세션 프로필을 덮지 않는다', async () => {
    const firstSession = { access_token: 'token-1', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const secondSession = { access_token: 'token-2', user: { id: 'user-2', email: 'lee@hospital.kr' } }
    const firstResponse = deferred<Response>()
    const secondResponse = deferred<Response>()
    const { client, listeners } = makeClient('INITIAL_SESSION', firstSession)
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      return authorization === 'Bearer token-2' ? secondResponse.promise : firstResponse.promise
    })
    render(<AuthProvider client={client} fetcher={fetcher}><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    act(() => listeners[0]('SIGNED_IN', secondSession))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await act(async () => { secondResponse.resolve(staffResponse('lee@hospital.kr', 'staff-2')) })
    await act(async () => { firstResponse.resolve(staffResponse()) })

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:ordinary:staff:lee@hospital.kr'))
  })

  test('[STAFF-LOGIN-10] 늦은 me 응답도 뒤이어 확인된 recovery 경계를 넘지 않는다', async () => {
    const session = { access_token: 'recovery-token', user: { id: 'user-1', email: 'kim@hospital.kr' } }
    const response = deferred<Response>()
    const { client, listeners } = makeClient('INITIAL_SESSION', session)
    const fetcher = vi.fn(() => response.promise)
    render(<AuthProvider client={client} fetcher={fetcher}><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())

    act(() => listeners[0]('PASSWORD_RECOVERY', session))
    await act(async () => { response.resolve(staffResponse()) })

    await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('ready:recovery:no-staff'))
  })
})
