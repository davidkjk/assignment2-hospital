import { NAV_ITEMS } from './navItems'

// 사이드바 라벨이 축약형인 화면은 규칙이 정한 서술형 제목을 여기서 덮어쓴다
// (사용자 결정 2026-08-29 「서술형 제목 유지」). 근거 규칙은 각 화면의 HEAD-01(모두 FINAL).
const SCREEN_TITLE: Record<string, string> = {
  '/admin/access-logs': '환자정보 열람 기록', // ALOG-HEAD-01
  '/admin/patient-merge-candidates': '중복 환자 후보', // MERGE-HEAD-01
  '/admin/errors': '시스템 오류 기록', // ERRADM-HEAD-01
  '/admin/merge-history': '병합 되돌림 이력', // MHIST 목록 서술형(사이드바 「병합 이력」)
}

// 헤더 제목 해석. 사이드바 항목이 없는 동적 상세 경로(환자 상세·오답 신고 작성)는 전용 제목을,
// 서술형 전용 제목은 SCREEN_TITLE을, 정확 경로는 navItems label을, 그 밖은 안전한 fallback을 준다.
// 화면마다 헤더가 「직원 업무」로 뭉개지지 않게.
export function resolveShellTitle(pathname: string): string {
  if (pathname.startsWith('/patients/')) return '환자 상세'
  if (pathname.startsWith('/chatlog/report/')) return '오답 신고 작성' // NAV-STFSUP-06 별도 전체 화면
  return SCREEN_TITLE[pathname] ?? NAV_ITEMS.find((item) => item.path === pathname)?.label ?? '직원 업무'
}
