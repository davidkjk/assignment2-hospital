import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'
import { routes } from '@/App'
import { renderApp } from '@/test-utils'
import { resetFamilyStore } from './familyState'

afterEach(() => {
  resetFamilyStore()
})

test('가족 목록은 폰 프레임 안에서 본인과 활성 가족을 보여준다', () => {
  renderApp(routes, ['/family'])

  expect(screen.getByTestId('family-list')).toBeInTheDocument()
  expect(screen.getByText('김순자')).toBeInTheDocument()
  expect(screen.getByText('박말순')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '가족 추가하기' })).toBeInTheDocument()
})

test('새 가족 등록은 성별을 선택해야 하고 저장하면 목록에 추가된다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/family/add/new'])

  const register = screen.getByRole('button', { name: '등록하기' })
  expect(register).toBeDisabled()

  await user.type(screen.getByLabelText('이름'), '김테스트')
  await user.type(screen.getByLabelText('생년월일'), '2000-01-01')
  await user.click(screen.getByLabelText('남'))
  expect(register).toBeEnabled()
  await user.click(register)

  expect(screen.getByTestId('family-list')).toBeInTheDocument()
  expect(screen.getByText('김테스트')).toBeInTheDocument()
})

test('기존 환자 연결은 일치 여부를 드러내지 않고 같은 인증 화면으로 진행한다', async () => {
  const user = userEvent.setup()
  renderApp(routes, ['/family/add/existing'])

  await user.type(screen.getByLabelText('휴대폰 번호'), '010-0000-0000')
  await user.click(screen.getByRole('button', { name: '인증번호 받기' }))

  expect(screen.getByText('인증번호를 보냈습니다.')).toBeInTheDocument()
  expect(screen.getByText(/병원 기록 여부는 알려드리지 않으며/)).toBeInTheDocument()

  await user.type(screen.getByLabelText('인증번호'), '123456')
  await user.click(screen.getByRole('button', { name: '연결하기' }))
  expect(screen.getByText('연결됐어요')).toBeInTheDocument()
})
