import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { routes } from './App'
import { AppointmentsProvider } from './state/appointments'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppointmentsProvider>
      <RouterProvider router={router} />
    </AppointmentsProvider>
  </StrictMode>,
)
