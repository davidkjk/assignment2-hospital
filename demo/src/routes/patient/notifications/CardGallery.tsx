import { Layers3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
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
          </div>
        </main>
      </div>
    </PhoneFrame>
  )
}
