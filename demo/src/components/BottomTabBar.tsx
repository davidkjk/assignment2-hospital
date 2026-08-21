import { CalendarDays, History, Home, MessageCircle, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

// 환자 앱 전역 셸의 하단 탭 5개(결정 문서: 홈·예약·가족·이력·AI 상담).
// 설정은 앱바 우상단, 알림함은 앱바 종. 라벨은 아이콘 아래 항상 유지(DISP-ICON-03).
export type TabKey = 'home' | 'appointments' | 'family' | 'history' | 'chat'

const TABS: { key: TabKey; label: string; icon: typeof Home; path: string }[] = [
  { key: 'home', label: '홈', icon: Home, path: '/home' },
  { key: 'appointments', label: '예약', icon: CalendarDays, path: '/appointments' },
  { key: 'family', label: '가족', icon: Users, path: '/family' },
  { key: 'history', label: '이력', icon: History, path: '/history' },
  { key: 'chat', label: 'AI 상담', icon: MessageCircle, path: '/chat' },
]

// 탭바를 그리지 않는 화면: 로그인 전(랜딩·로그인)과 QR 전체화면(몰입).
// 정본: AUTH-LAND-04·NAV-AUTH-19(로그인 전 탭 없음). QR은 전체화면 몰입이라 데모에서 숨긴다.
const HIDE_ON = new Set(['/', '/login', '/qr'])

// 현재 경로로 활성 탭을 판정한다(정본: 탭바는 전역, 활성 표시는 현재 최상위 탭).
// 설정·알림함·문진·마법사처럼 탭 소속이 아닌 화면은 아무 탭도 강조하지 않는다(null).
function activeKeyFor(pathname: string): TabKey | null {
  if (pathname.startsWith('/home')) return 'home'
  if (pathname.startsWith('/appointments') || pathname.startsWith('/appt')) return 'appointments'
  if (pathname.startsWith('/family')) return 'family'
  if (pathname.startsWith('/history')) return 'history'
  if (pathname.startsWith('/chat')) return 'chat'
  return null
}

export function BottomTabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (HIDE_ON.has(pathname) || pathname === '/signup' || pathname.startsWith('/auth/')) return null
  const active = activeKeyFor(pathname)

  return (
    <nav
      data-testid="bottom-tab-bar"
      className="flex shrink-0 items-stretch border-t border-border/60 bg-card shadow-[0_-1px_10px_rgba(0,0,0,0.05)]"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(tab.path)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? 'fill-primary/15' : ''}`} aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
