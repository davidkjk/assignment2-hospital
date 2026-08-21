import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './App'

test('홈 경로가 폰 프레임 안에 렌더된다', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/home'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByTestId('phone-frame')).toBeInTheDocument()
  expect(screen.getByTestId('home-screen')).toBeInTheDocument()
})
