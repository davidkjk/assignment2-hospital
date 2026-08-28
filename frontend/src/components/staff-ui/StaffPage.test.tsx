import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StaffPage } from './StaffPage'

test('본문을 감싸 보이고, 기본으로 데모 꼬리말을 붙인다', () => {
  render(<StaffPage testid="page">본문 내용</StaffPage>)
  const page = screen.getByTestId('page')
  expect(page).toHaveTextContent('본문 내용')
  expect(page).toHaveTextContent('데모 화면입니다')
})

test('footer=false면 꼬리말을 그리지 않는다', () => {
  render(<StaffPage testid="page" footer={false}>본문</StaffPage>)
  expect(screen.getByTestId('page')).not.toHaveTextContent('데모 화면입니다')
})

test('max prop으로 너비 클래스를 바꾼다', () => {
  render(<StaffPage testid="page" max="max-w-3xl">본문</StaffPage>)
  expect(screen.getByTestId('page').className).toContain('max-w-3xl')
})
