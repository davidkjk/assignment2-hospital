import type { RouteObject } from 'react-router-dom'
import { Login } from '@/routes/patient/Login'
import { Home } from '@/routes/patient/Home'
import { QrFullscreen } from '@/routes/patient/QrFullscreen'
import { BookingWizard } from '@/routes/patient/book/BookingWizard'

export const routes: RouteObject[] = [
  { path: '/', element: <Login /> },
  { path: '/home', element: <Home /> },
  { path: '/qr', element: <QrFullscreen /> },
  { path: '/book', element: <BookingWizard /> },
]
