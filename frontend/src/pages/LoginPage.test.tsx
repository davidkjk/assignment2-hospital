import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { LoginPage } from './LoginPage'

describe('직원 로그인', () => {
  test('[STAFF-LOGIN-01] 업무용 이메일과 비밀번호 두 칸만 제공한다', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><LoginPage onAuthenticate={vi.fn()} /></MemoryRouter>)
    expect(screen.getByLabelText('업무용 이메일')).toBeVisible()
    expect(screen.getByLabelText('비밀번호')).toBeVisible()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(/회원가입/)).toBeNull()
  })

  test('[STAFF-LOGIN-03] 눈 토글은 비밀번호 값과 제출 상태를 보존한다', async () => {
    const authenticate = vi.fn()
    const user = userEvent.setup()
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><LoginPage onAuthenticate={authenticate} /></MemoryRouter>)
    const password = screen.getByLabelText('비밀번호')
    await user.type(password, 'secret')
    await user.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('secret')
    expect(authenticate).not.toHaveBeenCalled()
  })

  test('[STAFF-LOGIN-07] 모든 인증 실패를 같은 한 문장으로 보여준다', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><LoginPage onAuthenticate={vi.fn().mockRejectedValue(new Error('inactive account'))} /></MemoryRouter>)
    await user.type(screen.getByLabelText('업무용 이메일'), 'nobody@hospital.kr')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '로그인' }))
    expect(await screen.findByText('로그인 정보를 확인해 주세요')).toBeVisible()
    expect(screen.queryByText(/비활성|등록되지 않은|inactive/)).toBeNull()
  })

  test('[STAFF-LOGIN-10] 폼 아래에 비밀번호 재설정 링크를 둔다', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><LoginPage onAuthenticate={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: '비밀번호 재설정' })).toHaveAttribute('href', '/reset-password')
  })
})
