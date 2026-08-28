import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import { Header } from './Header'

const staff = { staffId: 's1', name: '김직원', email: 'kim@hospital.kr', role: 'receptionist' as const, departmentId: null, departmentName: null }

// 2026-08-28 개정: 헤더 왼쪽 = 지금 화면 제목(병원명은 사이드바 워드마크가 상시 표시).
test('[SHELL-HDR-01] 헤더 왼쪽은 지금 화면 제목이고, 종 없이 등록·접수·예약 세 문을 오른쪽에 둔다', () => {
  render(<MemoryRouter initialEntries={['/queue']}><Header title="대기 목록" staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  expect(screen.queryByLabelText(/알림/)).toBeNull()
  expect(screen.getAllByTestId('start-door').map((button) => button.textContent)).toEqual(['등록', '접수', '예약'])
  const header = screen.getByRole('banner')
  expect(header.textContent?.trimStart().startsWith('대기 목록')).toBe(true)
})

// [SHELL-DOOR-01] 라벨은 「아이콘 + 글자」 — `＋` 기호를 글자 앞에 적지 않는다(2026-08-28 개정).
test('[SHELL-DOOR-01] 세 문은 기호 대신 아이콘을 달고, 가운데(접수)만 강조색이다', () => {
  render(<MemoryRouter><Header title="대기 목록" staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  const doors = screen.getAllByTestId('start-door')
  expect(doors.map((b) => b.textContent)).toEqual(['등록', '접수', '예약'])
  doors.forEach((b) => expect(b.querySelector('svg')).not.toBeNull())
  expect(doors[1].className).toContain('bg-primary')
})

test('[SHELL-HDR-03] 로그아웃은 항상 확인창을 거친다', async () => {
  const onSignOut = vi.fn()
  const user = userEvent.setup()
  render(<Header title="대기 목록" staff={staff} onSignOut={onSignOut} />)
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(screen.getByRole('dialog', { name: '로그아웃할까요?' })).toBeVisible()
  expect(onSignOut).not.toHaveBeenCalled()
})

test('[SHELL-ACT-03] 의사에게 세 문을 아예 그리지 않는다', () => {
  render(<MemoryRouter><Header title="진료 화면" staff={{ ...staff, role: 'doctor' }} onSignOut={vi.fn()} /></MemoryRouter>)
  expect(screen.queryAllByTestId('start-door')).toHaveLength(0)
})

test('[SHELL-HDR-04] 로그아웃 확인창은 저장하지 않은 내용이 사라진다고 말하지 않는다', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><Header title="대기 목록" staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  expect(screen.queryByText(/저장하지 않은|사라집니다/)).toBeNull()
})

test('[SHELL-HDR-05] 로그아웃과 시작 문 사이에 넓은 구분 여백이 있다', () => {
  render(<MemoryRouter><Header title="대기 목록" staff={staff} onSignOut={vi.fn()} /></MemoryRouter>)
  expect(screen.getByTestId('start-door-group')).toHaveStyle({ marginLeft: '16px', paddingLeft: '24px' })
})

// [NAV-SHELL-12] 클릭 대상이 헤더 병원명 → 사이드바 워드마크로 옮겨졌다(2026-08-28 개정, Sidebar.test).
//   헤더 쪽에서는 「제목이 링크가 아니다」만 지킨다.
test('[NAV-SHELL-12] 헤더 제목은 링크가 아니라 클릭해도 이동하지 않는다', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/queue']}>
      <Header title="대기 목록" staff={staff} onSignOut={vi.fn()} />
      <Routes><Route path="*" element={<LocationProbe />} /></Routes>
    </MemoryRouter>,
  )
  const title = screen.getByRole('heading', { name: '대기 목록' })
  expect(title.closest('a')).toBeNull()
  await user.click(title)
  expect(screen.getByTestId('pathname')).toHaveTextContent('/queue')
})

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="pathname">{location.pathname}</span>
}
