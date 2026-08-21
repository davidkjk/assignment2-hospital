import { ExternalLink, MapPin, Phone, QrCode, UserRound } from 'lucide-react'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PhoneFrame } from '@/components/PhoneFrame'
import type { Appointment } from '@/mock/types'
import { formatAppointmentDateTime } from './format'
import { getAppointment, getAppointmentDetailData } from './mockData'

type DetailNavigationState = {
  changedAppointment?: Appointment
  changeComplete?: boolean
}

const MANAGEABLE_STATUSES = new Set<Appointment['status']>(['예약신청', '예약확정'])

function StatusBadge({ status }: { status: Appointment['status'] }) {
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
      {status}
    </span>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3 border-b py-3 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium">{children}</dd>
    </div>
  )
}

export function ApptDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const locationState = (location.state ?? {}) as DetailNavigationState
  const fallbackAppointment = getAppointment(id)
  const changedAppointment = locationState.changedAppointment
  const appointment =
    changedAppointment?.id === fallbackAppointment.id ? changedAppointment : fallbackAppointment
  const detail = getAppointmentDetailData(appointment.id)
  const relation = appointment.patientName === '김순자' ? '본인' : '가족'
  const canManage = MANAGEABLE_STATUSES.has(appointment.status)

  return (
    <PhoneFrame>
      <div data-testid="appt-detail" className="flex h-full flex-col">
        <ScreenHeader title="예약 상세" onBack={() => navigate(-1)} />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b bg-primary/5 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-bold">{formatAppointmentDateTime(appointment.date, appointment.time)}</p>
                <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
                  {appointment.patientName} · {relation}
                </p>
              </div>
              <StatusBadge status={appointment.status} />
            </div>

            <p data-testid="appointment-status" className="mt-4 text-sm text-muted-foreground">
              상태: {appointment.status} · {detail.statusActor} · {detail.statusAt}
            </p>
            {appointment.status === '예약신청' && (
              <p className="mt-3 flex items-start gap-2 border-l-4 border-destructive pl-3 text-sm text-destructive">
                <span className="font-medium">병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.</span>
              </p>
            )}
          </section>

          <div className="space-y-4 px-5 py-5">
            {locationState.changeComplete && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-primary bg-primary/10 p-3 text-sm font-semibold text-primary"
              >
                <span>예약번호가 새로 발급되었습니다</span>
              </div>
            )}

            <Card>
              <CardContent className="pt-2">
                <dl>
                  <InfoRow label="진료과">{appointment.deptName}</InfoRow>
                  <InfoRow label="담당의사">{appointment.doctorName} 선생님</InfoRow>
                  <InfoRow label="장소">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(detail.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-1 hover:underline"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>
                        {detail.place}
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {detail.address} · 지도 앱으로 길 찾기
                        </span>
                      </span>
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    </a>
                  </InfoRow>
                  {detail.reason && <InfoRow label="방문이유">{detail.reason}</InfoRow>}
                </dl>
              </CardContent>
            </Card>

            <a
              href={`tel:${detail.phone}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:border-primary hover:bg-primary/5"
            >
              <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>
                <span className="block font-semibold">병원 전화</span>
                <span className="text-muted-foreground">{detail.phone}</span>
              </span>
            </a>

            {appointment.hasQR ? (
              <Card>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">접수 QR</p>
                    <p className="text-sm text-muted-foreground">병원 도착 후 접수할 때 사용하세요</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => navigate('/qr')}>
                    <QrCode className="mr-1 h-4 w-4 text-primary" aria-hidden="true" /> QR 보기
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                확정되면 여기에 접수용 QR이 나타납니다
              </div>
            )}
          </div>
        </main>

        <footer className="sticky bottom-0 border-t bg-background p-4">
          {canManage ? (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => navigate(`/appt/${appointment.id}/change`)}>
                예약 변경
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/appt/${appointment.id}/cancel`)}
              >
                예약 취소
              </Button>
            </div>
          ) : (
            <p className="rounded-lg bg-primary/5 p-3 text-center text-sm text-muted-foreground">
              접수가 끝난 예약입니다. 변경·취소는 접수처에 말씀해 주세요
            </p>
          )}
        </footer>
      </div>
    </PhoneFrame>
  )
}
