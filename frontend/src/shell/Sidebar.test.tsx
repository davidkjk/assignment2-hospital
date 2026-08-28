import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test } from 'vitest'
import { Sidebar } from './Sidebar'

test('[SHELL-NAV-02] 접수직원은 업무 그룹 6개만 본다', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar role="receptionist" /></MemoryRouter>)
  expect(within(screen.getByRole('navigation')).getAllByRole('link').map((link) => link.textContent)).toEqual([
    '오늘의 현황', '대기 목록', '예약 캘린더', '환자 검색', '상담봇 문의함', '안내 보내기',
  ])
})

test('[SHELL-NAV-03] 의사는 진료 화면과 환자 검색만 본다', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar role="doctor" /></MemoryRouter>)
  expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['진료 화면', '환자 검색'])
})

test('[SHELL-NAV-05] 건수가 0이면 숫자를 그리지 않는다', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar role="receptionist" counts={{ '/queue': 0 }} /></MemoryRouter>)
  expect(screen.queryByText('0')).toBeNull()
})

test('[SHELL-NAV-01][SHELL-NAV-04] 관리자는 네 그룹을 정해진 순서로 본다', () => {
  render(<MemoryRouter><Sidebar role="admin" /></MemoryRouter>)
  expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['업무', '기록', '상담봇 관리', '설정'])
  expect(screen.queryByRole('link', { name: '진료 화면' })).toBeNull()
})

test('[SHELL-NAV-06] 현재 화면은 active 상태와 3px 비색상 표식을 가진다', () => {
  render(<MemoryRouter initialEntries={['/patients/p-77']}><Sidebar role="receptionist" /></MemoryRouter>)
  const active = screen.getByRole('link', { name: '환자 검색' })
  expect(active).toHaveClass('active')
  expect(active).toHaveAttribute('aria-current', 'page')
})

test('[SHELL-NAV-08] 아이콘 링크는 마우스와 키보드 포커스에서 이름 툴팁을 제공한다', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><Sidebar role="receptionist" /></MemoryRouter>)
  const link = screen.getByRole('link', { name: '오늘의 현황' })
  await user.hover(link)
  expect(screen.getByRole('tooltip')).toHaveTextContent('오늘의 현황')
  await user.unhover(link)
  await user.tab()
  expect(await screen.findByRole('tooltip')).toHaveTextContent('오늘의 현황')
})

test('[SHELL-NAV-01] 그룹 접기·펼치기 스위치를 제공하지 않는다', () => {
  render(<MemoryRouter><Sidebar role="admin" /></MemoryRouter>)
  expect(screen.queryAllByRole('button', { name: /접기|펼치기/ })).toHaveLength(0)
})

// 2026-08-28 개정: 스프라이트(`<symbol>`+`<use>`) → 데모와 같은 Phosphor 채움 컴포넌트.
//   취지(벡터 재사용·이모지 금지·항목마다 아이콘)는 그대로라 그 셋을 검사한다.
test('[SHELL-NAV-11] 모든 메뉴 항목이 벡터 아이콘을 갖고, 이모지를 쓰지 않는다', () => {
  render(<MemoryRouter><Sidebar role="admin" /></MemoryRouter>)
  const links = screen.getAllByRole('link')
  links.forEach((link) => expect(link.querySelector('svg')).not.toBeNull())
  expect(screen.getByTestId('icon-today').tagName.toLowerCase()).toBe('svg')
  const nav = screen.getByRole('navigation')
  expect(nav.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u)
})
