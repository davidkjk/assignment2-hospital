import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './App'

test('홈 경로가 폰 프레임 안에 렌더된다', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/home'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByTestId('phone-frame')).toBeInTheDocument()
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})

test('로그인 버튼이 홈으로 보낸다', async () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})
