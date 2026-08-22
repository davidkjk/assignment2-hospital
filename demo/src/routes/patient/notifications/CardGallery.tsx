import { ArrowLeft, CalendarPlus, Layers3 } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { StatusCard } from './StatusCard'
import { demoAppointments } from './mockData'

/**
 * 카드 상태 모음 = 시연·QA용 레퍼런스 시트.
 * 폰 프레임 '밖'에 넓게 펼쳐 모든 예약 카드 상태를 한눈에 비교한다(B-2, 2026-08-22).
 * 각 카드는 앱과 같은 폭(~360px)·같은 배경 위에 둬 실제 모습 그대로 보이게 한다.
 */
export function CardGallery() {
  const navigate = useNavigate()

  return (
    <div data-testid="card-gallery" className="min-h-screen w-full bg-neutral-200/60 pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-primary px-5 py-3 text-primary-foreground shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
        <button
          type="button"
          aria-label="뒤로"
          onClick={() => navigate(-1)}
          className="-ml-1 rounded-full p-1.5 hover:bg-white/15"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Layers3 className="h-5 w-5" aria-hidden="true" />
        <h1 className="text-base font-medium">예약 카드 상태 모음</h1>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-sm text-muted-foreground">
          시연·QA용 레퍼런스입니다. 예약 상태가 바뀌어도 카드 가운데 영역의 높이는 일정하게 유지됩니다.
        </p>

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {demoAppointments.map((appointment, index) => (
            <section key={appointment.id} aria-labelledby={`${appointment.id}-title`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 id={`${appointment.id}-title`} className="font-semibold">
                  {index + 1}. {appointment.status}
                </h2>
                <span className="text-xs text-muted-foreground">{appointment.relation}</span>
              </div>
              {/* 앱과 같은 배경(#F2F5F7) 위에 카드를 둬 테두리·그림자가 실제처럼 보이게 한다. */}
              <div className="rounded-2xl bg-background p-4">
                <StatusCard appointment={appointment} />
              </div>
            </section>
          ))}

          {/* 오늘 예약이 없을 때(빈 상태, HOME-EMPTY-01) — 클릭으로 닿기 어려운 상태라 함께 전시. */}
          <section aria-labelledby="empty-title" data-testid="gallery-empty-state">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="empty-title" className="font-semibold">
                {demoAppointments.length + 1}. 예약 없음 (빈 상태)
              </h2>
              <span className="text-xs text-muted-foreground">홈 화면</span>
            </div>
            <div className="rounded-2xl bg-background p-4">
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
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
