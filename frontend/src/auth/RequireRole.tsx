import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { ALL_STAFF, homeFor, type Role } from './roles'
import { canAccessPath, navItemForPath } from '../shell/navItems'

export function RequireRole({ roles, children }: { roles?: readonly Role[]; children: ReactNode }) {
  const { loading, session, staff } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  if (loading) return <p role="status">로그인 정보를 확인하는 중입니다</p>
  if (!session || !staff) return <Navigate to="/login" replace />
  const routeItem = navItemForPath(location.pathname)
  const allowed = routeItem ? canAccessPath(staff.role, location.pathname) : (roles ?? ALL_STAFF).includes(staff.role)
  if (!allowed) {
    const home = homeFor(staff.role)
    const label = staff.role === 'doctor' ? '진료 화면으로 가기' : '오늘의 현황으로 가기'
    return (
      <main aria-labelledby="role-denied-title" style={{ maxWidth: 560, margin: '12vh auto', padding: 32, background: 'var(--color-surface)', borderRadius: 12 }}>
        <h1 id="role-denied-title">이 화면을 볼 권한이 없습니다</h1>
        <p>현재 역할에서 사용할 수 있는 기본 화면으로 이동해 주세요.</p>
        <button type="button" onClick={() => navigate(home, { replace: true })}>{label}</button>
      </main>
    )
  }
  return children
}
