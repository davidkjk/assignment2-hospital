import { screen, waitFor, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { leftColumn, rightColumn, setupStaff, sidebarActive } from './testUtils'

// [STAFF-SHELL-*·D-STAFF-01] 그릇·권한 — /admin/staff.

test('[STAFF-SHELL-01] 관리자가 아니면 본문(직원 관리 제목)이 보이지 않는다', async () => {
  setupStaff({ role: 'receptionist' })
  expect(await screen.findByText('이 화면을 볼 권한이 없습니다')).toBeVisible()
  expect(screen.queryByRole('heading', { name: '직원 관리' })).toBeNull()
})

test('[STAFF-SHELL-01] 관리자가 아니면 직원 목록을 서버에 조회조차 하지 않는다', async () => {
  const { api } = setupStaff({ role: 'receptionist' })
  await screen.findByText('이 화면을 볼 권한이 없습니다')
  expect(api.calls('GET /staff')).toHaveLength(0)
})

test('[STAFF-SHELL-02] 사이드바 현재 위치는 직원 관리, 제목은 셸 헤더가 그리고 본문엔 두지 않는다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(sidebarActive()).toBe('직원 관리')
  // 제목은 셸 헤더가 그린다(STAFF-SHELL-02 개정) — 본문엔 자체 제목을 두지 않는다.
  expect(screen.queryByRole('heading', { name: '직원 관리' })).toBeNull()
})

test('[D-STAFF-01] 왼쪽 목록과 오른쪽 초대 폼이 한 화면에 함께 있다', async () => {
  setupStaff()
  await screen.findByText('이민호')
  expect(within(leftColumn()).getByRole('list', { name: '직원 목록' })).toBeVisible()
  expect(within(rightColumn()).getByRole('form', { name: '직원 초대' })).toBeVisible()
})

test('[STAFF-PROFILE-12] ?doctor= 로 들어오면 그 의사 프로필 패널이 이미 열려 있다', async () => {
  setupStaff({ path: '/admin/staff?doctor=s-002' })
  await waitFor(() =>
    expect(within(rightColumn()).getByRole('heading')).toHaveTextContent('이민호 선생님 프로필'),
  )
})
