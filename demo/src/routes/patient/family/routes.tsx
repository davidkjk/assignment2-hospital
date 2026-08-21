import type { RouteObject } from 'react-router-dom'
import { FamilyAdd } from './FamilyAdd'
import { FamilyEdit } from './FamilyEdit'
import { FamilyList } from './FamilyList'
import { NewFamily } from './NewFamily'
import { ExistingFamily } from './ExistingFamily'

// [W3 소유] 묶음 6(가족). 신규 프로필 추가 / 기존 환자 OTP 연결 분기.
// App.tsx는 건드리지 않고 이 배열만 앱의 라우터에 펼쳐진다.
export const familyRoutes: RouteObject[] = [
  { path: '/family', element: <FamilyList /> },
  { path: '/family/add', element: <FamilyAdd /> },
  { path: '/family/add/new', element: <NewFamily /> },
  { path: '/family/add/existing', element: <ExistingFamily /> },
  { path: '/family/:memberId/edit', element: <FamilyEdit /> },
]
