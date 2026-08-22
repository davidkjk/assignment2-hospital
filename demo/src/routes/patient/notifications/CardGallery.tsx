import { CalendarPlus, Layers3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Button } from '@/components/ui/button'
import { StatusCard } from './StatusCard'
import { demoAppointments } from './mockData'

export function CardGallery() {
  const navigate = useNavigate()

  return (
    <PhoneFrame>
      <div data-testid="card-gallery" className="flex h-full flex-col bg-background">
        <ScreenHeader
          title="예약 카드 상태 모음"
          onBack={() => navigate(-1)}
          icon={<Layers3 className="h-5 w-5" />}
        />

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-5 text-sm text-muted-foreground">
            예약 상태가 바뀌어도 카드 가운데 영역의 높이는 일정하게 유지됩니다.
          </p>
          <div className="space-y-7">
            {demoAppointments.map((appointment, index) => (
              <section key={appointment.id} aria-labelledby={`${appointment.id}-title`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 id={`${appointment.id}-title`} className="font-semibold">
                    {index + 1}. {appointment.status}
                  </h2>
                  <span className="text-xs text-muted-foreground">{appointment.relation}</span>
                </div>
                <StatusCard appointment={appointment} />
              </section>
            ))}

            {/* 오늘 예약이 없을 때(빈 상태, HOME-EMPTY-01) — 데모는 예약이 고정이라 클릭으로 닿기 어려워 여기에 함께 둔다. */}
            <section aria-labelledby="empty-title" data-testid="gallery-empty-state">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id="empty-title" className="font-semibold">
                  {demoAppointments.length + 1}. 예약 없음 (빈 상태)
                </h2>
                <span className="text-xs text-muted-foreground">홈 화면</span>
              </div>
              <div className="rounded-xl border bg-card px-5 py-10">
                <div className="flex flex-col items-center gap-4 text-center">
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
              </div>
            </section>
          </div>
        </main>
      </div>
    </PhoneFrame>
  )
}
