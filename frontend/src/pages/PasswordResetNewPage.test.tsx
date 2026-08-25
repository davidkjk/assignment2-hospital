import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/AuthProvider'
import { PasswordResetNewPage } from './PasswordResetNewPage'

const supabaseAuth = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: supabaseAuth } }))

function authValue(isRecoverySession: boolean) {
  return {
    session: { access_token: 'token' },
    staff: null,
    loading: false,
    isRecoverySession,
    login: vi.fn(),
    logout: vi.fn(),
    refreshStaff: vi.fn(),
    finishPasswordRecovery: vi.fn(),
  }
}

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

async function fillValidPassword() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('새 비밀번호'), 'brand-new1')
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new1')
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseAuth.updateUser.mockResolvedValue({ error: null })
  supabaseAuth.signOut.mockResolvedValue({ error: null })
})

test('[STAFF-LOGIN-10] 만료된 복구 링크는 재설정 재요청 길을 제공한다', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordResetNewPage verifyRecovery={vi.fn().mockResolvedValue(false)} /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: '비밀번호 재설정 다시 요청' })).toHaveAttribute('href', '/reset-password')
})

test('[STAFF-LOGIN-10] 일반 로그인 세션은 새 비밀번호 화면 proof가 아니다', async () => {
  render(
    <AuthContext.Provider value={authValue(false) as never}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordResetNewPage /></MemoryRouter>
    </AuthContext.Provider>,
  )

  expect(await screen.findByRole('link', { name: '비밀번호 재설정 다시 요청' })).toHaveAttribute('href', '/reset-password')
  expect(screen.queryByRole('heading', { name: '새 비밀번호 만들기' })).toBeNull()
})

test('[STAFF-LOGIN-10] PASSWORD_RECOVERY proof가 있는 세션만 새 비밀번호 화면을 연다', async () => {
  render(
    <AuthContext.Provider value={authValue(true) as never}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordResetNewPage /></MemoryRouter>
    </AuthContext.Provider>,
  )

  expect(await screen.findByRole('heading', { name: '새 비밀번호 만들기' })).toBeVisible()
})

describe('복구 비밀번호 저장 순서', () => {
  test('[STAFF-LOGIN-10] 비밀번호 저장 실패 뒤에는 다른 세션 종료를 호출하지 않는다', async () => {
    supabaseAuth.updateUser.mockResolvedValue({ error: new Error('update failed') })
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordResetNewPage verifyRecovery={vi.fn().mockResolvedValue(true)} /></MemoryRouter>)
    const user = await fillValidPassword()

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('비밀번호를 바꾸지 못했습니다')
    expect(supabaseAuth.signOut).not.toHaveBeenCalled()
  })

  test('[STAFF-LOGIN-10] 저장 뒤 다른 세션만 종료하고 둘 다 성공해야 로그인으로 간다', async () => {
    const auth = authValue(true)
    render(
      <AuthContext.Provider value={auth as never}>
        <MemoryRouter initialEntries={['/reset-password/new']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PasswordResetNewPage />
          <LocationProbe />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    const user = await fillValidPassword()

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: 'brand-new1' })
    expect(supabaseAuth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(supabaseAuth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(supabaseAuth.signOut.mock.invocationCallOrder[0])
    expect(auth.finishPasswordRecovery).toHaveBeenCalledOnce()
  })

  test('[STAFF-LOGIN-10] 다른 세션 종료가 실패하면 부분 성공을 완료로 표시하지 않는다', async () => {
    supabaseAuth.signOut.mockResolvedValue({ error: new Error('sign out failed') })
    render(
      <MemoryRouter initialEntries={['/reset-password/new']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PasswordResetNewPage verifyRecovery={vi.fn().mockResolvedValue(true)} />
        <LocationProbe />
      </MemoryRouter>,
    )
    const user = await fillValidPassword()

    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('다른 기기의 로그아웃을 마치지 못했습니다')
    expect(screen.getByTestId('location')).toHaveTextContent('/reset-password/new')
  })
})
