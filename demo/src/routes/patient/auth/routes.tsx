import type { RouteObject } from 'react-router-dom'
import { PhoneChangeGuide } from './PhoneChangeGuide'

// 인증 전 화면은 로그인과 같은 auth 묶음으로 관리한다.
export const authRoutes: RouteObject[] = [
  { path: '/auth/tel-change', element: <PhoneChangeGuide /> },
]
