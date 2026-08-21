import type { RouteObject } from 'react-router-dom'
import { Questionnaire } from './Questionnaire'
// [W2 소유] 묶음 5(사전문진). 문항 1개씩·자동저장·진행률.
// 이 폴더에서 화면 컴포넌트를 만들고 아래 배열에 등록한다. App.tsx는 건드리지 않는다.
// 예: { path: '/questionnaire', element: <Questionnaire /> }
export const questionnaireRoutes: RouteObject[] = [
  { path: '/questionnaire', element: <Questionnaire /> },
]
