import { ArrowLeft, Layers3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import { StatusCard } from './StatusCard'
import { demoAppointments } from './mockData'

export function CardGallery() {
  const navigate = useNavigate()

  return (
    <PhoneFrame>
      <div data-testid="card-gallery" className="flex h-full flex-col bg-background">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Button variant="ghost" size="icon" aria-label="뒤로" onClick={() => navigate(-1)}>
            <ArrowLeft className="text-primary" aria-hidden="true" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-primary">예약 카드 상태 모음</h1>
            <p className="text-xs text-muted-foreground">시연·QA용 10종 갤러리</p>
          </div>
          <Layers3 className="h-5 w-5 text-primary" aria-hidden="true" />
        </header>

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
          </div>
        </main>
      </div>
    </PhoneFrame>
  )
}
