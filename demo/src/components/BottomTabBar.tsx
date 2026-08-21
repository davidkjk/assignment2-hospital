import { CalendarDays, History, Home, MessageCircle, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

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

export function BottomTabBar({ active }: { active: TabKey }) {
  const navigate = useNavigate()
  return (
    <nav
      data-testid="bottom-tab-bar"
      className="flex shrink-0 items-stretch border-t bg-background"
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
