import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StaffPage } from './StaffPage'

test('본문을 감싸 보인다', () => {
  render(<StaffPage testid="page">본문 내용</StaffPage>)
  expect(screen.getByTestId('page')).toHaveTextContent('본문 내용')
})

// 데모 `_ui.tsx`는 "데모 화면입니다 · 가짜 데이터로…" 꼬리말을 기본으로 붙인다.
// 실 앱은 진짜 데이터를 쓰므로 그 문구가 화면에 나가면 안 된다.
test('데모 꼬리말을 그리지 않는다 — 실 앱은 가짜 데이터가 아니다', () => {
  render(<StaffPage testid="page">본문</StaffPage>)
  expect(screen.getByTestId('page')).not.toHaveTextContent('데모 화면입니다')
})

// 데모에서 옮겨 온 화면이 `footer={false}`를 넘겨도 컴파일·렌더가 깨지지 않아야 한다.
test('데모가 넘기던 footer prop을 받아도 문제없다', () => {
  render(<StaffPage testid="page" footer={false}>본문</StaffPage>)
  expect(screen.getByTestId('page')).toHaveTextContent('본문')
})

test('max prop으로 너비 클래스를 바꾼다', () => {
  render(<StaffPage testid="page" max="max-w-3xl">본문</StaffPage>)
  expect(screen.getByTestId('page').className).toContain('max-w-3xl')
})
