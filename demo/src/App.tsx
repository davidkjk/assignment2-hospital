import type { RouteObject } from 'react-router-dom'
import { Login } from '@/routes/patient/Login'
import { Home } from '@/routes/patient/Home'
import { QrFullscreen } from '@/routes/patient/QrFullscreen'
import { BookingWizard } from '@/routes/patient/book/BookingWizard'
import { Chat } from '@/routes/patient/chat/Chat'
// 각 묶음 워커가 자기 폴더의 routes 배열을 채운다(빈 배열이면 아무 경로도 안 늘어남).
import { apptRoutes } from '@/routes/patient/appt/routes'
import { questionnaireRoutes } from '@/routes/patient/questionnaire/routes'
import { familyRoutes } from '@/routes/patient/family/routes'
import { settingsRoutes } from '@/routes/patient/settings/routes'
import { notificationsRoutes } from '@/routes/patient/notifications/routes'

export const routes: RouteObject[] = [
  { path: '/', element: <Login /> },
  { path: '/home', element: <Home /> },
  { path: '/qr', element: <QrFullscreen /> },
  { path: '/book', element: <BookingWizard /> },
  { path: '/chat', element: <Chat /> },
  ...apptRoutes,
  ...questionnaireRoutes,
  ...familyRoutes,
  ...settingsRoutes,
  ...notificationsRoutes,
]
