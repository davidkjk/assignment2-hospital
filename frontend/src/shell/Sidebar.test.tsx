import { render, screen, within } from '@testing-library/react'
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

test('[SHELL-NAV-11] 모든 메뉴는 symbol/use 아이콘을 가진다', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Sidebar role="admin" /></MemoryRouter>)
  for (const link of screen.getAllByRole('link')) expect(link.querySelector('svg use')).not.toBeNull()
})
