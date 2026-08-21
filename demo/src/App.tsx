import type { RouteObject } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Home } from '@/routes/patient/Home'

// Login/Book는 이후 태스크에서 채운다. 지금은 라우팅 골격.
function LoginPlaceholder() {
  return (
    <PhoneFrame>
      <div data-testid="login-screen" className="p-6">
        <h1 className="text-xl font-bold">로그인</h1>
      </div>
    </PhoneFrame>
  )
}

function BookPlaceholder() {
  return (
    <PhoneFrame>
      <div data-testid="book-screen" className="p-6">
        <h1 className="text-xl font-bold">예약</h1>
      </div>
    </PhoneFrame>
  )
}

export const routes: RouteObject[] = [
  { path: '/', element: <LoginPlaceholder /> },
  { path: '/home', element: <Home /> },
  { path: '/book', element: <BookPlaceholder /> },
]
