import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../auth/useAuth'
import { ChangePasswordPanel } from './ChangePasswordPanel'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const session = { access_token: 'staff-access-token' }
const fetchMock = vi.fn()
const onClose = vi.fn()
const onDone = vi.fn()

function renderPanel() {
  const user = userEvent.setup()
  render(<ChangePasswordPanel onClose={onClose} onDone={onDone} />)
  return user
}

async function fillValidPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('현재 비밀번호'), 'current-password')
  await user.type(screen.getByLabelText('새 비밀번호'), 'brand-new1')
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'brand-new1')
}

beforeEach(() => {
  mockedUseAuth.mockReturnValue({ session, staff: null, loading: false } as ReturnType<typeof useAuth>)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)
  onClose.mockReset()
  onDone.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ChangePasswordPanel', () => {
  it('[SHELL-ME-03] 비밀번호 변경은 오른쪽 패널로 열린다', () => {
    renderPanel()

    expect(screen.getByRole('complementary', { name: '비밀번호 변경' })).toBeVisible()
  })

  it('[SHELL-PW-01] 현재 비밀번호를 묻는다', () => {
    renderPanel()

    expect(screen.getByLabelText('현재 비밀번호')).toBeVisible()
  })

  it('[SHELL-PW-02] 직원 패널은 SET-PW 입력 계약을 재사용한다', () => {
    renderPanel()

    expect(screen.getByTestId('password-fields')).toHaveAttribute('data-source', 'SET-PW-04~12,16')
  })

  it('[SET-PW-04] 새 비밀번호와 확인 두 칸을 둔다', () => {
    renderPanel()

    expect(screen.getAllByLabelText(/새 비밀번호/)).toHaveLength(2)
  })

  it('[SET-PW-06] 비밀번호 조건을 진입 시부터 한글로 보여준다', () => {
    renderPanel()

    expect(screen.getByRole('list', { name: '비밀번호 조건' })).toHaveTextContent(/8자 이상.*영문과 숫자를 함께.*두 칸이 서로 같음/)
  })

  it('[SET-PW-07] 조건을 만족하면 세 줄이 체크 표시와 성공색으로 바뀐다', async () => {
    const user = renderPanel()

    await fillValidPassword(user)

    const rules = screen.getAllByTestId('password-rule')
    expect(rules.every((rule) => rule.getAttribute('data-valid') === 'true' && rule.textContent?.includes('✓'))).toBe(true)
  })

  it('[SET-PW-08] 모든 비밀번호 값은 기본으로 가려진다', () => {
    renderPanel()

    const inputs = [
      screen.getByLabelText('현재 비밀번호'),
      screen.getByLabelText('새 비밀번호'),
      screen.getByLabelText('새 비밀번호 확인'),
    ]
    expect(inputs.every((input) => input.getAttribute('type') === 'password')).toBe(true)
  })

  it('[SET-PW-09] 보기 상태를 딥틸 토글 상태로 노출한다', async () => {
    const user = renderPanel()
    const toggle = screen.getByRole('button', { name: '비밀번호 보기' })

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveStyle({ color: 'var(--color-accent)' })
  })

  it('[SET-PW-10] 눈 토글은 44×44 터치 영역을 갖는다', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: '비밀번호 보기' })).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
  })

  it('[SET-PW-12] 처리 중 문구를 유지하고 중복 제출을 막는다', async () => {
    let resolveRequest: (value: { ok: boolean; status: number }) => void = () => undefined
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve }))
    const user = renderPanel()
    await fillValidPassword(user)
    const submit = screen.getByRole('button', { name: '비밀번호 변경' })

    await user.click(submit)
    expect(screen.getByRole('button', { name: '◌ 바꾸는 중…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '◌ 바꾸는 중…' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveRequest({ ok: true, status: 200 })
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('[SET-PW-11] 조건에 맞지 않는 새 비밀번호는 서버로 보내지 않는다', async () => {
    const user = renderPanel()
    await user.type(screen.getByLabelText('현재 비밀번호'), 'current-password')
    await user.type(screen.getByLabelText('새 비밀번호'), 'abcdefgh')
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'abcdefgh')

    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()
  })

  it('[SET-PW-16] 서버 오류를 버튼 바로 위에 붙이고 그 자리로 스크롤한다', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 })
    const user = renderPanel()
    await fillValidPassword(user)
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    const error = await screen.findByRole('alert')
    const submit = screen.getByRole('button', { name: '비밀번호 변경' })
    expect(error.nextElementSibling).toBe(submit)
    expect(scrollIntoView).toHaveBeenCalledOnce()
  })

  it('[SHELL-PW-03] 성공하면 부모의 완료 callback만 호출한다', async () => {
    const user = renderPanel()
    await fillValidPassword(user)
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('[SHELL-PW-04] 현재 세션을 유지하는 비밀번호 변경 endpoint를 사용한다', async () => {
    const user = renderPanel()
    await fillValidPassword(user)
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/me/password', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: `Bearer ${session.access_token}` }),
    })))
  })
})
