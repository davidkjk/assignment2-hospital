import { CheckCircle2, ChevronLeft, MessageCircle, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PhoneFrame } from '@/components/PhoneFrame'
import { formatAppointmentDateTime } from './format'
import { getAppointment } from './mockData'

export function ApptCancel() {
  const navigate = useNavigate()
  const { id } = useParams()
  const appointment = getAppointment(id)
  const [connected, setConnected] = useState(false)

  return (
    <PhoneFrame>
      <div data-testid="appt-cancel" className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-4">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate(`/appt/${appointment.id}`)}
            className="rounded-full p-1 hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <div>
            <p className="text-base font-bold">예약 취소 상담</p>
            <p className="text-xs text-muted-foreground">예약 정보를 확인하고 상담으로 연결합니다</p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <h1 className="text-xl font-bold">취소 상담을 연결할까요?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            마감 시간이 지난 예약은 상담 직원이 확인한 뒤 안내해 드립니다.
          </p>

          <Card className="mt-5">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">상담할 예약</p>
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted p-2">
                  <UserRound className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-bold">{appointment.patientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatAppointmentDateTime(appointment.date, appointment.time)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {appointment.deptName} · {appointment.doctorName} 선생님
                  </p>
                </div>
              </div>
              <p className="border-t pt-3 text-sm text-muted-foreground">
                예약은 상담 직원이 확인하기 전까지 유지됩니다.
              </p>
            </CardContent>
          </Card>

          {connected && (
            <div
              role="status"
              className="mt-5 flex items-start gap-3 rounded-xl border border-primary bg-secondary p-4"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">상담(직원 확인)으로 연결됐어요</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  직원이 예약을 확인하고 취소 상담을 이어갑니다.
                </p>
              </div>
            </div>
          )}
        </main>

        <footer className="sticky bottom-0 border-t bg-background p-4">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            disabled={connected}
            onClick={() => setConnected(true)}
          >
            <MessageCircle className="mr-1 h-5 w-5" aria-hidden="true" />
            {connected ? '상담 연결됨' : '상담 채팅 연결'}
          </Button>
        </footer>
      </div>
    </PhoneFrame>
  )
}
