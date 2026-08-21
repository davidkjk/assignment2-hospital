import { useNavigate } from 'react-router-dom'
import { Bell, CalendarPlus, Plus, Settings } from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import { AppointmentCard } from '@/components/AppointmentCard'
import { useAppointments } from '@/state/appointments'
import { today } from '@/mock/data'

// 정본 묶음 2(screen-behaviors.md:3027~3336), NAV-HOME-*.
// 가장 가까운 하루치 예약을 카드로, [+ 진료 예약하기]로 마법사 진입.
export function Home() {
  const navigate = useNavigate()
  const { appointments } = useAppointments()
  // 홈은 가장 가까운 하루치만 보인다(HOME-SCOPE-01). 나머지는 '예약' 탭이 담당.
  const todayAppointments = appointments.filter((a) => a.date === today)

  return (
    <PhoneFrame>
      <div data-testid="home-screen" className="flex h-full flex-col">
        {/* 브랜드 앱바 — 다른 화면과 같은 딥틸 밴드로 통일(로고는 흰 배경에 딥틸 H) */}
        <header className="flex h-12 items-center justify-between bg-primary px-5 text-primary-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-primary">
              <Plus className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
            </span>
            <span className="text-base font-medium tracking-normal">가온병원</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="알림"
              onClick={() => navigate('/notifications')}
              className="-mr-1 rounded-full p-1.5 hover:bg-white/15"
            >
              <Bell className="h-5 w-5" />
            </button>
            <button
              aria-label="설정"
              onClick={() => navigate('/settings')}
              className="rounded-full p-1.5 hover:bg-white/15"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">오늘의 예약</h2>
            <button
              onClick={() => navigate('/appointments')}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              전체 예약 보기 ›
            </button>
          </div>

          {todayAppointments.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground">예정된 예약이 없습니다</p>
              <Button onClick={() => navigate('/book')}>
                <CalendarPlus className="mr-1 h-4 w-4" /> 진료 예약하기
              </Button>
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                지난 방문 이력 보기 ›
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todayAppointments.map((a) => (
                <AppointmentCard key={a.id} appt={a} />
              ))}
            </div>
          )}
        </main>

        {/* 예약이 있을 때는 홈 하단에 예약 버튼을 두지 않는다(HOME-SCOPE-02·HOME-ROLE-01):
            새 예약 진입은 하단 탭 '예약'(→ + 새 예약하기)이 담당한다(역할 분리).
            0건 빈 상태의 [진료 예약하기]만 남는다(NAV-HOME-14·HOME-EMPTY-01). */}
      </div>
    </PhoneFrame>
  )
}
