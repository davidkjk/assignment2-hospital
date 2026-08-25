import type { Role } from '../auth/roles'

export type NavGroup = '업무' | '기록' | '상담봇 관리' | '설정'

export interface NavItem {
  path: string
  label: string
  group: NavGroup | null
  roles: readonly Role[]
  icon: string
}

const RECEPTION_AND_ADMIN = ['receptionist', 'admin'] as const
const ALL_STAFF = ['receptionist', 'doctor', 'admin'] as const
const ADMIN = ['admin'] as const

// 역할표 단일 원본: 사이드바와 route guard가 모두 이 표를 소비한다(ROLE-ADM-01).
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/doctor/console', label: '진료 화면', group: null, roles: ['doctor'], icon: 'stethoscope' },
  { path: '/today', label: '오늘의 현황', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'today' },
  { path: '/queue', label: '대기 목록', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'queue' },
  { path: '/calendar', label: '예약 캘린더', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'calendar' },
  { path: '/patients', label: '환자 검색', group: '업무', roles: ALL_STAFF, icon: 'search' },
  { path: '/tickets', label: '상담봇 문의함', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'message' },
  { path: '/messages', label: '안내 보내기', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'send' },
  { path: '/admin/stats', label: '운영 통계', group: '기록', roles: ADMIN, icon: 'chart' },
  { path: '/admin/access-logs', label: '접근 기록', group: '기록', roles: ADMIN, icon: 'shield' },
  { path: '/chatlog', label: '상담봇 기록', group: '기록', roles: ADMIN, icon: 'log' },
  { path: '/admin/patient-merge-candidates', label: '중복 환자', group: '기록', roles: ADMIN, icon: 'merge' },
  { path: '/admin/merge-history', label: '병합 이력', group: '기록', roles: ADMIN, icon: 'history' },
  { path: '/admin/errors', label: '시스템 오류', group: '기록', roles: ADMIN, icon: 'warning' },
  { path: '/bot/knowledge', label: '안내자료', group: '상담봇 관리', roles: ADMIN, icon: 'book' },
  { path: '/bot/unresolved', label: '미해결 질문', group: '상담봇 관리', roles: ADMIN, icon: 'question' },
  { path: '/bot/reports', label: '오답 처리함', group: '상담봇 관리', roles: ADMIN, icon: 'flag' },
  { path: '/bot/quality', label: '품질 리포트', group: '상담봇 관리', roles: ADMIN, icon: 'quality' },
  { path: '/bot/overview', label: '상담봇 현황', group: '상담봇 관리', roles: ADMIN, icon: 'bot' },
  { path: '/admin/staff', label: '직원 관리', group: '설정', roles: ADMIN, icon: 'staff' },
  { path: '/admin/schedule', label: '진료 일정 관리', group: '설정', roles: ADMIN, icon: 'schedule' },
  { path: '/admin/questionnaires', label: '문진표 관리', group: '설정', roles: ADMIN, icon: 'form' },
  { path: '/admin/settings', label: '병원 설정', group: '설정', roles: ADMIN, icon: 'settings' },
] as const

export const NAV_GROUPS: readonly NavGroup[] = ['업무', '기록', '상담봇 관리', '설정']

export function canAccess(role: Role, item: NavItem): boolean {
  return item.roles.includes(role)
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const normalized = pathname.startsWith('/patients/') ? '/patients' : pathname
  const item = NAV_ITEMS.find((entry) => entry.path === normalized)
  return item ? canAccess(role, item) : false
}
