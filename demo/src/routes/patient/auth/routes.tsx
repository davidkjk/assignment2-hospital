import type { RouteObject } from 'react-router-dom'
import { LoginForm } from './LoginForm'
import { PhoneChangeGuide } from './PhoneChangeGuide'
import { SignupWizard } from './SignupWizard'

// 인증 전 화면은 로그인과 같은 auth 묶음으로 관리한다.
export const authRoutes: RouteObject[] = [
  { path: '/login', element: <LoginForm /> },
  { path: '/auth/tel-change', element: <PhoneChangeGuide /> },
  { path: '/signup', element: <SignupWizard /> },
]
