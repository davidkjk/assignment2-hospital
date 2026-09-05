import type { RouteObject } from 'react-router-dom'
import { History } from './History'
import { Hospital } from './Hospital'
import { Notifications } from './Notifications'
import { Password } from './Password'
import { Settings } from './Settings'
import { Withdraw } from './Withdraw'

// [W4 소유] 묶음 7(이력·설정·탈퇴). 지난 예약 이력, 설정 하위 화면, 재인증.
// 이 폴더에서 화면 컴포넌트를 만들고 아래 배열에 등록한다. App.tsx는 건드리지 않는다.
// 예: { path: '/history', element: <History /> }, { path: '/settings', element: <Settings /> }
export const settingsRoutes: RouteObject[] = [
  { path: '/history', element: <History /> },
  { path: '/settings', element: <Settings /> },
  { path: '/settings/notifications', element: <Notifications /> },
  { path: '/settings/password', element: <Password /> },
  { path: '/settings/hospital', element: <Hospital /> },
  { path: '/settings/withdraw', element: <Withdraw /> },
]
