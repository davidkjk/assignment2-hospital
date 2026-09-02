import { ADMIN_ONLY, ALL_STAFF, RECEPTION_AND_ADMIN, type Role } from '../auth/roles'

export type NavGroup = '업무' | '기록' | '상담봇 관리' | '설정'

export interface NavItem {
  path: string
  label: string
  group: NavGroup | null
  roles: readonly Role[]
  icon: string
}

export type StartDoor = 'register' | 'checkin' | 'appointment'

export interface StartDoorItem {
  key: StartDoor
  label: string
  /** 라벨 왼쪽 아이콘 — `＋` 기호를 대신한다(데모 정렬 2026-08-28). */
  icon: string
  roles: readonly Role[]
  primary?: boolean
}

// 세 문의 이름은 「아이콘 + 글자」다 — `＋ 등록` 같은 기호 표기를 쓰지 않는다(사용자 확정 2026-08-28,
// `SHELL-HDR-01`·`SHELL-ACT-01`·`SHELL-DOOR-01` 개정). 「새로 만드는 문」이라는 뜻은 아이콘이 진다.
export const START_DOORS: readonly StartDoorItem[] = [
  { key: 'register', label: '등록', icon: 'register', roles: RECEPTION_AND_ADMIN },
  { key: 'checkin', label: '접수', icon: 'checkin', roles: RECEPTION_AND_ADMIN, primary: true },
  { key: 'appointment', label: '예약', icon: 'appointment', roles: RECEPTION_AND_ADMIN },
] as const

// 역할표 단일 원본: 사이드바와 route guard가 모두 이 표를 소비한다(ROLE-ADM-01).
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/doctor/console', label: '진료 화면', group: null, roles: ['doctor'], icon: 'stethoscope' },
  { path: '/today', label: '오늘의 현황', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'today' },
  { path: '/queue', label: '대기 목록', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'queue' },
  { path: '/calendar', label: '예약 캘린더', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'calendar' },
  { path: '/patients', label: '환자 검색', group: '업무', roles: ALL_STAFF, icon: 'search' },
  { path: '/tickets', label: '상담봇 문의함', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'message' },
  { path: '/messages', label: '안내 보내기', group: '업무', roles: RECEPTION_AND_ADMIN, icon: 'send' },
  { path: '/admin/stats', label: '운영 통계', group: '기록', roles: ADMIN_ONLY, icon: 'chart' },
  { path: '/admin/access-logs', label: '접근 기록', group: '기록', roles: ADMIN_ONLY, icon: 'shield' },
  { path: '/chatlog', label: '상담봇 기록', group: '기록', roles: ADMIN_ONLY, icon: 'log' },
  { path: '/admin/patient-merge-candidates', label: '중복 환자', group: '기록', roles: ADMIN_ONLY, icon: 'merge' },
  { path: '/admin/merge-history', label: '병합 이력', group: '기록', roles: ADMIN_ONLY, icon: 'history' },
  { path: '/admin/errors', label: '시스템 오류', group: '기록', roles: ADMIN_ONLY, icon: 'warning' },
  { path: '/bot/knowledge', label: '안내자료', group: '상담봇 관리', roles: ADMIN_ONLY, icon: 'book' },
  { path: '/bot/unresolved', label: '미해결 질문', group: '상담봇 관리', roles: ADMIN_ONLY, icon: 'question' },
  { path: '/bot/reports', label: '오답 처리함', group: '상담봇 관리', roles: ADMIN_ONLY, icon: 'flag' },
  { path: '/bot/quality', label: '품질 리포트', group: '상담봇 관리', roles: ADMIN_ONLY, icon: 'quality' },
  { path: '/bot/overview', label: '상담봇 현황', group: '상담봇 관리', roles: ADMIN_ONLY, icon: 'bot' },
  { path: '/admin/staff', label: '직원 관리', group: '설정', roles: ADMIN_ONLY, icon: 'staff' },
  { path: '/admin/schedule', label: '진료 일정 관리', group: '설정', roles: ADMIN_ONLY, icon: 'schedule' },
  { path: '/admin/questionnaires', label: '문진표 관리', group: '설정', roles: ADMIN_ONLY, icon: 'form' },
  { path: '/admin/settings', label: '병원 설정', group: '설정', roles: ADMIN_ONLY, icon: 'settings' },
] as const

export const NAV_GROUPS: readonly NavGroup[] = ['업무', '기록', '상담봇 관리', '설정']

export function canAccess(role: Role, item: NavItem): boolean {
  return item.roles.includes(role)
}

export function canStartDoor(role: Role, door: StartDoor): boolean {
  return START_DOORS.find((item) => item.key === door)?.roles.includes(role) ?? false
}

export function normalizeNavPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  const withoutTrailingSlash = path.length > 1 ? path.replace(/\/$/, '') : path
  if (withoutTrailingSlash.startsWith('/patients/')) return '/patients'
  if (withoutTrailingSlash.startsWith('/doctor/console/')) return '/doctor/console'
  if (withoutTrailingSlash.startsWith('/chatlog/')) return '/chatlog' // 오답 신고 작성(/chatlog/report/:id)도 기록 그룹 활성
  return withoutTrailingSlash
}

export function navItemForPath(pathname: string): NavItem | undefined {
  const normalized = normalizeNavPath(pathname)
  return NAV_ITEMS.find((entry) => entry.path === normalized)
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const item = navItemForPath(pathname)
  return item ? canAccess(role, item) : false
}
