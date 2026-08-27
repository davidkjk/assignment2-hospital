import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useIdleLogout } from '../auth/useIdleLogout'
import { Header, type StartDoor } from './Header'
import { IdleBanner } from './IdleBanner'
import { Sidebar } from './Sidebar'
import { useState } from 'react'
import { NAV_ITEMS } from './navItems'
import { OfflineBanner } from '../components/OfflineBanner'
import { PanelHost, PanelProvider } from '../components/PanelHost'
import { ServerEffects } from '../api/serverEffects'

const RETURN_KEY = 'staff-session-return'

export function AppShell() {
  const { staff, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [door, setDoor] = useState<StartDoor | null>(null)
  const idle = useIdleLogout({ signOut: async () => {
    if (staff) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: location.pathname, staffId: staff.staffId }))
    await logout()
    navigate('/login', { replace: true })
  } })
  if (!staff) return null
  const title = location.pathname.startsWith('/patients/')
    ? '환자 상세'
    : NAV_ITEMS.find((item) => item.path === location.pathname)?.label ?? '직원 업무'
  return (
    <PanelProvider>
      {/* 매 서버 호출의 결말을 연결·세션 배선으로 보낸다(성공→markServerOk / 온라인 401→세션 만료). */}
      <ServerEffects />
      <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--color-bg)', color: 'var(--color-ink)' }}>
        <Sidebar role={staff.role} />
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* 연결이 끊기면 화면 맨 위 고정 띠로 알린다(OFFX-STAFF-01·02). */}
          <OfflineBanner />
          {idle.isWarning && <IdleBanner onContinue={idle.keepAlive} />}
          <Header staff={staff} onSignOut={async () => { await logout(); navigate('/login', { replace: true }) }} onStart={setDoor} />
          <main style={{ padding: 24 }}><h1 style={{ margin: '0 0 16px', fontSize: 'var(--fs-xl)' }}>{title}</h1><Outlet /></main>
        </div>
        {/* 앱 전체에 하나뿐인 「만드는 중」 패널(PANEL-ONE-01) — 소비 화면이 openPanel로 채운다. */}
        <PanelHost />
        {door && <aside aria-label={`${door} 패널`} style={{ position: 'fixed', right: 0, top: 64, bottom: 0, width: 380, background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)', padding: 20, zIndex: 15 }}><button onClick={() => setDoor(null)}>닫기</button><h2>{door === 'register' ? '환자 등록' : door === 'checkin' ? '접수' : '예약'}</h2><p>업무 패널 내용은 다음 공통 패널 태스크에서 연결됩니다.</p></aside>}
      </div>
    </PanelProvider>
  )
}
