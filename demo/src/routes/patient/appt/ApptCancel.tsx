import { MessageCircle, UserRound } from '@/components/icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PhoneFrame } from '@/components/PhoneFrame'
import { formatAppointmentDateTime } from './format'
import { getAppointment } from './mockData'

// 취소 마감 후 취소 상담(CANCEL-LATE-*). [상담 채팅 연결]을 누르면 채팅 화면으로
// 이동해 봇이 예약 정보·연결 사실·예약이 유지됨을 설명한다(CANCEL-LATE-10).
export function ApptCancel() {
  const navigate = useNavigate()
  const { id } = useParams()
  const appointment = getAppointment(id)

  return (
    <PhoneFrame>
      <div data-testid="appt-cancel" className="flex h-full flex-col">
        <ScreenHeader title="예약 취소 상담" onBack={() => navigate(-1)} />

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <h1 className="text-xl font-bold">취소 상담을 연결할까요?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            마감 시간이 지난 예약은 상담 직원이 확인한 뒤 안내해 드립니다.
          </p>

          <Card className="mt-5">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">상담할 예약</p>
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
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
        </main>

        <footer className="sticky bottom-0 border-t bg-background p-4">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            onClick={() =>
              navigate('/chat', {
                state: {
                  context: 'cancel',
                  patientName: appointment.patientName,
                  when: formatAppointmentDateTime(appointment.date, appointment.time),
                  dept: appointment.deptName,
                },
              })
            }
          >
            <MessageCircle className="mr-1 h-5 w-5" aria-hidden="true" />
            상담 채팅 연결
          </Button>
        </footer>
      </div>
    </PhoneFrame>
  )
}
