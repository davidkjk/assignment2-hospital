import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { NavBadge } from './NavBadge'

test('[SHELL-NAV-05] 건수가 0/없음이면 아무것도 그리지 않는다', () => {
  const { container } = render(<NavBadge count={0} />)
  expect(container).toBeEmptyDOMElement()
  const { container: c2 } = render(<NavBadge />)
  expect(c2).toBeEmptyDOMElement()
})

test('[SHELL-NAV-05] 건수를 숫자와 "N건" 라벨로 표시한다', () => {
  render(<NavBadge count={3} />)
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getByLabelText('3건')).toBeInTheDocument()
})

test('[SHELL-NAV-BADGE-01] 눈에 띄게 채운 배지 — 배경색과 대비되는 글자색을 가진다(평문 아님)', () => {
  render(<NavBadge count={3} />)
  const badge = screen.getByLabelText('3건')
  // 채운 알약: 배경이 실제로 칠해져 있어야 한다(예전엔 배경 없는 글자색뿐이라 묻혔다).
  expect(badge.style.background).not.toBe('')
  expect(badge.style.color).not.toBe('')
})

test('[SHELL-NAV-05] 연결이 끊기면 라벨에 "연결 끊김"을 알린다', () => {
  render(<NavBadge count={2} connected={false} />)
  expect(screen.getByLabelText('2건, 연결 끊김')).toBeInTheDocument()
})
