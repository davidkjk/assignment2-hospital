import type { RouteObject } from 'react-router-dom'
import { CardGallery } from './CardGallery'
import { Notifications } from './Notifications'

// [W5 소유] 묶음 2 잔여(알림함 + 예약 카드 10종 상태 모음).
// 이 폴더에서 화면 컴포넌트를 만들고 아래 배열에 등록한다. App.tsx는 건드리지 않는다.
// 예: { path: '/notifications', element: <Notifications /> }, { path: '/cards', element: <CardGallery /> }
export const notificationsRoutes: RouteObject[] = [
  { path: '/notifications', element: <Notifications /> },
  { path: '/cards', element: <CardGallery /> },
]
