import type { RouteObject } from 'react-router-dom'
import { StaffShell } from './StaffShell'
import { StaffLogin } from './auth/Login'
import { Today } from './today/Today'
import { Queue } from './queue/Queue'
import { Checkin } from './checkin/Checkin'
import { PatientDetail } from './patient/PatientDetail'
import { PatientSearch } from './patients/PatientSearch'
// slice2 — 업무
import { Calendar } from './calendar/Calendar'
import { Tickets } from './tickets/Tickets'
import { Chatlog } from './chatlog/Chatlog'
import { Messages } from './messages/Messages'
// slice2 — 의사
import { DoctorConsole } from './doctor/DoctorConsole'
// slice2 — 관리자 기록
import { Stats } from './admin/record/Stats'
import { AccessLogs } from './admin/record/AccessLogs'
import { MergeCandidates } from './admin/record/MergeCandidates'
import { MergeHistory } from './admin/record/MergeHistory'
import { Errors } from './admin/record/Errors'
// slice2 — 관리자 설정
import { StaffAdmin } from './admin/config/StaffAdmin'
import { Schedule } from './admin/config/Schedule'
import { Questionnaires } from './admin/config/Questionnaires'
import { HospitalSettings } from './admin/config/HospitalSettings'
// slice2 — 상담봇 관리자
import { Knowledge } from './bot/Knowledge'
import { Unresolved } from './bot/Unresolved'
import { Reports } from './bot/Reports'
import { Quality } from './bot/Quality'
import { Overview } from './bot/Overview'

// 직원 웹 데모 라우트 — /staff/*. 폰 프레임 없이 StaffShell(데스크톱) 레이아웃.
// 척추 + slice2 병렬 워커(A~E) 산출을 코디네이터가 배선. 화면 컴포넌트는 각 폴더 소유.
export const staffRoutes: RouteObject[] = [
  { path: '/staff/login', element: <StaffLogin /> },
  {
    path: '/staff',
    element: <StaffShell />,
    children: [
      { index: true, element: <Today /> },
      { path: 'today', element: <Today /> },
      // 업무
      { path: 'queue', element: <Queue /> },
      { path: 'checkin', element: <Checkin /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'patients', element: <PatientSearch /> },
      { path: 'patients/:id', element: <PatientDetail /> },
      { path: 'tickets', element: <Tickets /> },
      { path: 'chatlog', element: <Chatlog /> },
      { path: 'messages', element: <Messages /> },
      // 의사
      { path: 'doctor/console', element: <DoctorConsole /> },
      // 기록
      { path: 'admin/stats', element: <Stats /> },
      { path: 'admin/access-logs', element: <AccessLogs /> },
      { path: 'admin/patient-merge-candidates', element: <MergeCandidates /> },
      { path: 'admin/merge-history', element: <MergeHistory /> },
      { path: 'admin/errors', element: <Errors /> },
      // 설정
      { path: 'admin/staff', element: <StaffAdmin /> },
      { path: 'admin/schedule', element: <Schedule /> },
      { path: 'admin/questionnaires', element: <Questionnaires /> },
      { path: 'admin/settings', element: <HospitalSettings /> },
      // 상담봇
      { path: 'bot/knowledge', element: <Knowledge /> },
      { path: 'bot/unresolved', element: <Unresolved /> },
      { path: 'bot/reports', element: <Reports /> },
      { path: 'bot/quality', element: <Quality /> },
      { path: 'bot/overview', element: <Overview /> },
    ],
  },
]
