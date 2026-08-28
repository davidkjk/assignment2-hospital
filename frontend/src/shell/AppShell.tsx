import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useIdleLogout } from '../auth/useIdleLogout'
import { Header, type StartDoor } from './Header'
import { IdleBanner } from './IdleBanner'
import { Sidebar } from './Sidebar'
import { NAV_ITEMS } from './navItems'
import { OfflineBanner } from '../components/OfflineBanner'
import { PanelHost, PanelProvider } from '../components/PanelHost'
import { ServerEffects } from '../api/serverEffects'
import { useMessagesBadge } from '../pages/messages/useMessagesBadge'

const RETURN_KEY = 'staff-session-return'

// 직원 웹 데스크톱 셸 — 사이드바 + 상단바 + 넓은 본문(데모 `StaffShell.tsx` 구조).
// 화면 전체가 스크롤하지 않는다: 높이를 h-screen으로 잠그고 본문만 스크롤한다.
// 그래야 사이드바·헤더가 늘 제자리에 있어 창구에서 눈이 흔들리지 않는다.
//
// ⚠️ 본문 래퍼(mx-auto max-w-6xl px-6 py-5)는 지금 이 셸이 준다. 데모 화면은 같은 일을 하는
//    `StaffPage`로 자기를 감싸고 있어, 화면을 포팅할 때 둘이 겹친다 → Task S1에서 한 번 정하고
//    19화면에 일괄 적용한다(계획 §5). 그전까지는 기존 화면이 깨지지 않도록 셸이 계속 준다.
export function AppShell() {
  const { staff, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [door, setDoor] = useState<StartDoor | null>(null)
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
    <PanelProvider>
      {/* 매 서버 호출의 결말을 연결·세션 배선으로 보낸다(성공→markServerOk / 온라인 401→세션 만료). */}
      <ServerEffects />
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar role={staff.role} counts={badgeCounts} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 연결이 끊기면 화면 맨 위 고정 띠로 알린다(OFFX-STAFF-01·02). */}
          <OfflineBanner />
          {idle.isWarning && <IdleBanner onContinue={idle.keepAlive} />}
          <Header
            staff={staff}
            onSignOut={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            onStart={setDoor}
          />
          <div className="flex min-h-0 flex-1">
            <main className="relative min-h-0 flex-1 overflow-y-auto">
              {/* 화면 제목은 본문에 둔다 — 헤더 왼쪽은 병원명이다(SHELL-HDR-01·STAFF-SHELL-02). */}
              <div className="mx-auto max-w-6xl px-6 py-5">
                <h1 className="mb-4 text-xl font-semibold">{title}</h1>
                <Outlet />
              </div>
            </main>
            {/* TODO(M3): 세 문 패널 본체 + 왼쪽 화면 변신(DoorRegion·workSurfaceFor). */}
            {door && (
              <aside
                aria-label={`${door} 패널`}
                className="flex w-[380px] shrink-0 flex-col border-l border-border bg-card p-5 shadow-[var(--shadow-card)]"
              >
                <button type="button" onClick={() => setDoor(null)} className="self-end text-sm text-muted-foreground hover:text-foreground">
                  ✕ 닫기
                </button>
                <h2 className="mt-1 text-sm font-bold">
                  {door === 'register' ? '환자 등록' : door === 'checkin' ? '접수' : '예약'}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">업무 패널 내용은 다음 공통 패널 태스크에서 연결됩니다.</p>
              </aside>
            )}
          </div>
        </div>
        {/* 앱 전체에 하나뿐인 「만드는 중」 패널(PANEL-ONE-01) — 소비 화면이 openPanel로 채운다. */}
        <PanelHost />
      </div>
    </PanelProvider>
  )
}
