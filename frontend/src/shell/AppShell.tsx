import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth'
import { useIdleLogout } from '../auth/useIdleLogout'
import { Header } from './Header'
import { IdleBanner } from './IdleBanner'
import { Sidebar } from './Sidebar'
import { NAV_ITEMS } from './navItems'
import { OfflineBanner } from '../components/OfflineBanner'
import { PanelHost, PanelProvider } from '../components/PanelHost'
import { ServerEffects } from '../api/serverEffects'
import { useMessagesBadge } from '../pages/messages/useMessagesBadge'
import { DoorProvider, useDoors } from './doors/DoorContext'
import { DoorRegion } from './doors/panels'
import { workSurfaceFor } from './doors/surfaces'

const RETURN_KEY = 'staff-session-return'

// 직원 웹 데스크톱 셸 — 사이드바 + 상단바 + 넓은 본문(데모 `StaffShell.tsx` 구조).
// 화면 전체가 스크롤하지 않는다: 높이를 h-screen으로 잠그고 본문만 스크롤한다.
// 그래야 사이드바·헤더가 늘 제자리에 있어 창구에서 눈이 흔들리지 않는다.
//
// ⚠️ 본문 래퍼(mx-auto max-w-6xl px-6 py-5)는 지금 이 셸이 준다. 데모 화면은 같은 일을 하는
//    `StaffPage`로 자기를 감싸고 있어, 화면을 포팅할 때 둘이 겹친다 → Task S1에서 한 번 정하고
//    19화면에 일괄 적용한다(계획 §5). 그전까지는 기존 화면이 깨지지 않도록 셸이 계속 준다.
function ShellBody() {
  const { staff, logout } = useAuth()
  const { open } = useDoors()
  const location = useLocation()
  const navigate = useNavigate()
  const idle = useIdleLogout({
    signOut: async () => {
      if (staff) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: location.pathname, staffId: staff.staffId }))
      await logout()
      navigate('/login', { replace: true })
    },
  })
  // SEND-BADGE-01 — 「안내 보내기」 사이드바 배지(전화해야 할 미처리 실패). 접수·관리자만 조회.
  const badgeCounts = useMessagesBadge(staff?.role === 'receptionist' || staff?.role === 'admin')
  if (!staff) return null
  const title = location.pathname.startsWith('/patients/')
    ? '환자 상세'
    : (NAV_ITEMS.find((item) => item.path === location.pathname)?.label ?? '직원 업무')
  return (
    <>
      {/* 매 서버 호출의 결말을 연결·세션 배선으로 보낸다(성공→markServerOk / 온라인 401→세션 만료). */}
      <ServerEffects />
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar role={staff.role} counts={badgeCounts} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 연결이 끊기면 화면 맨 위 고정 띠로 알린다(OFFX-STAFF-01·02). */}
          <OfflineBanner />
          {idle.isWarning && <IdleBanner onContinue={idle.keepAlive} />}
          <Header
            title={title}
            staff={staff}
            onSignOut={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            onStart={open}
          />
          <div className="flex min-h-0 flex-1">
            <MainRegion />
            {/* 세 문의 오른쪽 패널 — 열려 있으면 왼쪽이 그 칸의 도구로 바뀐다(SHELL-DOOR-06). */}
            <DoorRegion />
          </div>
        </div>
        {/* 앱 전체에 하나뿐인 「만드는 중」 패널(PANEL-ONE-01) — 소비 화면이 openPanel로 채운다. */}
        <PanelHost />
      </div>
    </>
  )
}

// 문이 열려 어떤 칸을 채우는 중이면 왼쪽이 그 도구로 바뀌고(PANEL-WORK-01),
// 아니면 보던 화면이 그대로 있다 — 문이 열려 있어도 자유롭게 보고 이동할 수 있다(PANEL-BACK-02).
function MainRegion() {
  const { openDoor, activeField, draft, collapsed, setField } = useDoors()
  const { pathname } = useLocation()
  const prev = useRef(pathname)

  // 문이 열린 채 사이드바로 다른 화면에 가면 → 왼쪽 도구를 접고 그 화면을 보여준다.
  // 패널은 살아남아 따라온다(PANEL-LIVE-01). 칸을 다시 누르면 도구가 돌아온다.
  useEffect(() => {
    if (prev.current !== pathname) {
      prev.current = pathname
      if (openDoor && activeField) setField(null)
    }
  }, [pathname, openDoor, activeField, setField])

  const surface = openDoor && !collapsed ? workSurfaceFor(openDoor, activeField, !!draft.doctor, !!draft.patient) : null
  if (surface) {
    return <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{surface}</main>
  }
  // 캘린더는 전체 높이·폭 격자다 — 문서형 max-w 래퍼(아래)를 쓰면 cal-page가 높이를 못 받아
  // 격자 자체 스크롤이 안 생기고(자동 스크롤 무효), 폭이 잘려 의사 열이 안 보인다.
  if (pathname === '/calendar') {
    return (
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    )
  }
  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto">
      {/* 화면 제목은 헤더 왼쪽이 그린다(`SHELL-HDR-01` 개정 2026-08-28) — 본문에 또 적지 않는다. */}
      <div className="mx-auto max-w-6xl px-6 py-5">
        <Outlet />
      </div>
    </main>
  )
}

// ⚠️ DoorProvider는 PanelProvider 안이어야 한다 — 두 그릇이 서로를 닫아 「패널은 하나」를 지킨다(PANEL-ONE-01).
export function AppShell() {
  return (
    <PanelProvider>
      <DoorProvider>
        <ShellBody />
      </DoorProvider>
    </PanelProvider>
  )
}
