import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { Header } from './Header'
import { HOSPITAL_NAME } from './brand'

const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

test('[SHELL-HDR-01] 헤더 왼쪽 최상단은 병원명이고, 종 없이 등록·접수·예약 세 문을 오른쪽에 둔다', () => {
  render(<MemoryRouter initialEntries={['/queue']}><Header staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  expect(screen.queryByLabelText(/알림/)).toBeNull()
  expect(screen.getAllByTestId('start-door').map((button) => button.textContent)).toEqual(['＋ 등록', '＋ 접수', '＋ 예약'])
  const header = screen.getByRole('banner')
  expect(header.textContent?.trimStart().startsWith(HOSPITAL_NAME)).toBe(true)
  // 화면명(제목)은 헤더가 아니라 본문(main)에 온다 — 헤더엔 없다
  expect(screen.queryByTestId('header-page-title')).toBeNull()
})

test('[SHELL-HDR-03] 로그아웃은 항상 확인창을 거친다', async () => {
  const onSignOut = vi.fn()
  const user = userEvent.setup()
  render(<Header staff={staff} onSignOut={onSignOut} />)
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(screen.getByRole('dialog', { name: '로그아웃할까요?' })).toBeVisible()
  expect(onSignOut).not.toHaveBeenCalled()
})

test('[SHELL-ACT-03] 의사에게 세 문을 아예 그리지 않는다', () => {
  render(<MemoryRouter><Header staff={{ ...staff, role: 'doctor' }} onSignOut={vi.fn()} /></MemoryRouter>)
  expect(screen.queryAllByTestId('start-door')).toHaveLength(0)
})

test('[SHELL-HDR-04] 로그아웃 확인창은 저장하지 않은 내용이 사라진다고 말하지 않는다', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><Header staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(screen.queryByText(/저장하지 않은|사라집니다/)).toBeNull()
})

test('[SHELL-HDR-05] 로그아웃과 시작 문 사이에 넓은 구분 여백이 있다', () => {
  render(<MemoryRouter><Header staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  expect(screen.getByTestId('start-door-group')).toHaveStyle({ marginLeft: '16px', paddingLeft: '24px' })
})

test('[NAV-SHELL-12] 헤더 병원명은 링크가 아니라 클릭해도 이동하지 않는다', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/queue']}>
      <Header staff={staff} onSignOut={vi.fn()} />
      <Routes><Route path="*" element={<LocationProbe />} /></Routes>
    </MemoryRouter>,
  )
  const name = screen.getByText(HOSPITAL_NAME)
  expect(name.closest('a')).toBeNull()
  expect(screen.getByTestId('pathname')).toHaveTextContent('/queue')
  await user.click(name)
  expect(screen.getByTestId('pathname')).toHaveTextContent('/queue')
})

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="pathname">{location.pathname}</span>
}
