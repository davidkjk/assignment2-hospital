import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { PasswordResetNewPage } from './PasswordResetNewPage'

test('[STAFF-LOGIN-10] 만료된 복구 링크는 재설정 재요청 길을 제공한다', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordResetNewPage verifyRecovery={vi.fn().mockResolvedValue(false)} /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: '비밀번호 재설정 다시 요청' })).toHaveAttribute('href', '/reset-password')
})
