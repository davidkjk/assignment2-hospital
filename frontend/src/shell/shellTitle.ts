import { NAV_ITEMS } from './navItems'

// 헤더 제목 해석. 사이드바 항목이 없는 동적 상세 경로(환자 상세·오답 신고 작성)는 전용 제목을 주고,
// 정확 경로는 navItems label을, 그 밖은 안전한 fallback을 준다. 화면마다 헤더가 「직원 업무」로 뭉개지지 않게.
export function resolveShellTitle(pathname: string): string {
  if (pathname.startsWith('/patients/')) return '환자 상세'
  if (pathname.startsWith('/chatlog/report/')) return '오답 신고 작성' // NAV-STFSUP-06 별도 전체 화면
  return NAV_ITEMS.find((item) => item.path === pathname)?.label ?? '직원 업무'
}
