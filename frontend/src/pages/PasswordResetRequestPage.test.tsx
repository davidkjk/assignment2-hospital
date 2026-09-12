import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import * as httpClient from '../api/httpClient'
import { PasswordResetRequestPage } from './PasswordResetRequestPage'

const { ApiError } = httpClient

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PasswordResetRequestPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

test('[STAFF-LOGIN-10] 이메일을 넣고 보내면 셀프 재설정 엔드포인트를 부르고 같은 안내를 보인다', async () => {
  const spy = vi.spyOn(httpClient, 'apiFetch').mockResolvedValue(undefined)
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText('업무용 이메일'), 'me@hospital.kr')
  await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }))

  expect(spy).toHaveBeenCalledWith(
    '/auth/staff/password-reset',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'me@hospital.kr' }) }),
  )
  expect(await screen.findByText(/링크를 이메일로 보냈습니다/)).toBeVisible()
})

test('[STAFF-LOGIN-10] 계정 존재 여부와 무관하게 같은 안내를 보인다(열거 방지)', async () => {
  // 서버 오류(존재하지 않는 이메일 등)도 성공과 같은 문구로 삼킨다 — 계정 유무를 드러내지 않는다.
  vi.spyOn(httpClient, 'apiFetch').mockRejectedValue(new ApiError('nope', 404))
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText('업무용 이메일'), 'nobody@hospital.kr')
  await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }))

  expect(await screen.findByText(/링크를 이메일로 보냈습니다/)).toBeVisible()
})

test('[STAFF-LOGIN-10] 요청이 과하면(429) 잠시 뒤 다시 시도하라고 안내한다', async () => {
  vi.spyOn(httpClient, 'apiFetch').mockRejectedValue(new ApiError('rate', 429))
  const user = userEvent.setup()
  renderPage()

  await user.type(screen.getByLabelText('업무용 이메일'), 'me@hospital.kr')
  await user.click(screen.getByRole('button', { name: '재설정 링크 받기' }))

  expect(await screen.findByText(/요청이 많습니다/)).toBeVisible()
})

test('[STAFF-LOGIN-10] 로그인으로 돌아가는 길을 준다', () => {
  renderPage()
  expect(screen.getByRole('link', { name: '로그인으로 돌아가기' })).toHaveAttribute('href', '/login')
})
