import type { RouteObject } from 'react-router-dom'
import { StaffShell } from './StaffShell'
import { StaffLogin } from './auth/Login'
import { Today } from './today/Today'
import { Queue } from './queue/Queue'
import { Checkin } from './checkin/Checkin'
import { PatientDetail } from './patient/PatientDetail'
import { PatientSearch } from './patients/PatientSearch'
import { StaffPlaceholder } from './Placeholder'

// 직원 웹 데모 라우트 — /staff/*. 폰 프레임 없이 StaffShell(데스크톱) 레이아웃.
// 척추(이번 슬라이스): /staff/login → /staff/today. 나머지 화면은 셸 안에서 '곧' 자리표시.
// 실제 앱 route 정본 18개(plan 88~111): today·queue·checkin·patients·calendar·doctor/console·admin/* 등.
const p = (title: string) => <StaffPlaceholder title={title} />

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
      { path: 'calendar', element: p('예약 캘린더') },
      { path: 'patients', element: <PatientSearch /> },
      { path: 'patients/:id', element: <PatientDetail /> },
      { path: 'tickets', element: p('문의 티켓함') },
      { path: 'chatlog', element: p('전체 상담 기록') },
      { path: 'messages', element: p('안내 보내기') },
      // 의사
      { path: 'doctor/console', element: p('진료 화면') },
      // 기록
      { path: 'admin/stats', element: p('운영 통계') },
      { path: 'admin/access-logs', element: p('접근 기록') },
      { path: 'admin/patient-merge-candidates', element: p('중복 환자') },
      { path: 'admin/merge-history', element: p('병합 이력') },
      { path: 'admin/errors', element: p('시스템 오류') },
      // 설정
      { path: 'admin/staff', element: p('직원 관리') },
      { path: 'admin/schedule', element: p('진료 일정') },
      { path: 'admin/questionnaires', element: p('문진표 관리') },
      { path: 'admin/settings', element: p('병원 설정') },
      // 상담봇
      { path: 'bot/knowledge', element: p('안내자료') },
      { path: 'bot/unresolved', element: p('미해결 질문') },
      { path: 'bot/reports', element: p('오답 처리함') },
      { path: 'bot/quality', element: p('품질 리포트') },
      { path: 'bot/overview', element: p('상담봇 현황') },
    ],
  },
]
