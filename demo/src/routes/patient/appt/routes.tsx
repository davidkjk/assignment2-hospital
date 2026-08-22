import type { RouteObject } from 'react-router-dom'
import { ApptChange } from './ApptChange'
import { ApptDetail } from './ApptDetail'
import { MyAppointments } from './MyAppointments'

// [W1 소유] 묶음 4(상세·변경·취소) + 묶음 8(나의 예약 목록).
// 이 폴더에서 화면 컴포넌트를 만들고 아래 배열에 등록한다.
// App.tsx는 이 배열을 이미 spread하므로 App.tsx는 건드리지 않는다.
// 취소는 별도 화면이 아니라 상세 위 팝업이다(CANCEL-PRE-01·LATEFLOW-POP-OPEN-01) → ApptDetail이 담당.
export const apptRoutes: RouteObject[] = [
  { path: '/appointments', element: <MyAppointments /> },
  { path: '/appt/:id/change', element: <ApptChange /> },
  { path: '/appt/:id', element: <ApptDetail /> },
]
