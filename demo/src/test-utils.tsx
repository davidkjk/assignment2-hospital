import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { AppointmentsProvider } from '@/state/appointments'

/** 라우터 + 공유 상태 Provider로 감싸 렌더한다. */
export function renderApp(routes: RouteObject[], initialEntries: string[] = ['/']) {
  const router = createMemoryRouter(routes, { initialEntries })
  return render(
    <AppointmentsProvider>
      <RouterProvider router={router} />
    </AppointmentsProvider>,
  )
}
