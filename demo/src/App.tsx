import type { RouteObject } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Login } from '@/routes/patient/Login'
import { Home } from '@/routes/patient/Home'
import { QrFullscreen } from '@/routes/patient/QrFullscreen'

// Book는 이후 태스크에서 채운다. 지금은 라우팅 골격.
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
  { path: '/', element: <Login /> },
  { path: '/home', element: <Home /> },
  { path: '/qr', element: <QrFullscreen /> },
  { path: '/book', element: <BookPlaceholder /> },
]
