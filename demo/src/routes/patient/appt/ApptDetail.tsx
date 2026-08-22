import { useState } from 'react'
import {
  CalendarPlus,
  Clock3,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  QrCode,
  UserRound,
} from '@/components/icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { DoctorAvatar } from '@/components/DoctorAvatar'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PhoneFrame } from '@/components/PhoneFrame'
import type { Appointment } from '@/mock/types'
import { formatAppointmentDateTime } from './format'
import {
  DEMO_CANCEL_DEADLINE_HOURS,
  getAppointment,
  getAppointmentDetailData,
  getCancelTier,
} from './mockData'

type DetailNavigationState = {
  changedAppointment?: Appointment
  changeComplete?: boolean
}

const MANAGEABLE_STATUSES = new Set<Appointment['status']>(['예약신청', '예약확정'])

function StatusBadge({ status, tone }: { status: string; tone?: 'primary' | 'muted' }) {
  const muted = tone === 'muted'
  return (
    <span
      className={
        muted
          ? 'rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground'
          : 'rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary'
      }
    >
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
  // 확정 전(예약신청)은 용어가 상태를 따라간다 — '예약 취소'가 아니라 '신청 취소'(APPT-HEAD-04·CARD-COMMON-02).
  const isPending = appointment.status === '예약신청'
  const cancelLabel = isPending ? '신청 취소' : '예약 취소'

  // 취소 확인창(pre·new)과 마감 후 안내 팝업(late)을 상세 위에 띄운다(CANCEL-PRE-01·LATEFLOW-POP-OPEN-01).
  const [cancelDialog, setCancelDialog] = useState<'confirm' | 'late' | null>(null)
  // 취소가 끝나면 화면을 옮기지 않고 같은 상세를 '취소됨' 모습으로 다시 그린다(CANCEL-PRE-07·CANCEL-DONE-*).
  const [cancelled, setCancelled] = useState(false)

  const when = formatAppointmentDateTime(appointment.date, appointment.time)

  function openCancel() {
    // 30분 이내 신규(new)와 마감 전(pre)은 같은 확인창, 마감 후(late)만 안내 팝업.
    setCancelDialog(getCancelTier(appointment.id) === 'late' ? 'late' : 'confirm')
  }

  function confirmCancel() {
    setCancelled(true)
    setCancelDialog(null)
  }

  function connectSupportChat() {
    setCancelDialog(null)
    navigate('/chat', {
      state: { context: 'cancel', patientName: appointment.patientName, when, dept: appointment.deptName },
    })
  }

  return (
    <PhoneFrame>
      <div data-testid="appt-detail" className="flex h-full flex-col">
        <ScreenHeader title="예약 상세" onBack={() => navigate(-1)} />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <section
            className={`border-b px-5 py-5 ${cancelled ? 'bg-muted' : 'bg-primary/5'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-xl font-bold ${cancelled ? 'text-muted-foreground line-through' : ''}`}>
                  {when}
                </p>
                <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
                  {appointment.patientName} · {relation}
                </p>
              </div>
              {cancelled ? (
                <StatusBadge status="취소됨" tone="muted" />
              ) : (
                <StatusBadge status={appointment.status} />
              )}
            </div>

            {cancelled ? (
              <p data-testid="appointment-status" className="mt-4 text-sm text-muted-foreground">
                방금 · 앱에서 직접 취소했습니다
              </p>
            ) : (
              <p data-testid="appointment-status" className="mt-4 text-sm text-muted-foreground">
                상태: {appointment.status} · {detail.statusActor} · {detail.statusAt}
              </p>
            )}
            {!cancelled && appointment.status === '예약신청' && (
              <p className="mt-3 flex items-start gap-2 border-l-4 border-destructive pl-3 text-sm text-destructive">
                <span className="font-medium">병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.</span>
              </p>
            )}
          </section>

          <div className="space-y-4 px-5 py-5">
            {locationState.changeComplete && !cancelled && (
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
                  <InfoRow label="담당의사">
                    <span className="flex items-center gap-2">
                      <DoctorAvatar seed={appointment.doctorName} name={appointment.doctorName} className="h-7 w-7" />
                      {appointment.doctorName} 선생님
                    </span>
                  </InfoRow>
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

            {!cancelled &&
              (appointment.hasQR ? (
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
              ))}
          </div>
        </main>

        <footer className="sticky bottom-0 border-t bg-background p-4">
          {cancelled ? (
            // 막다른 길을 만들지 않는다 — 취소 후엔 '새로 예약하기' 하나(CANCEL-DONE-03).
            <Button type="button" size="lg" className="h-12 w-full text-base" onClick={() => navigate('/book')}>
              <CalendarPlus className="mr-1 h-5 w-5" aria-hidden="true" /> 새로 예약하기
            </Button>
          ) : canManage ? (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => navigate(`/appt/${appointment.id}/change`)}>
                예약 변경
              </Button>
              {/* 상세의 [예약 취소]는 회색 테두리 — 빨간 버튼은 확인창 안에서만(CANCEL-PRE-04). */}
              <Button type="button" variant="outline" onClick={openCancel}>
                {cancelLabel}
              </Button>
            </div>
          ) : (
            <p className="rounded-lg bg-primary/5 p-3 text-center text-sm text-muted-foreground">
              접수가 끝난 예약입니다. 변경·취소는 접수처에 말씀해 주세요
            </p>
          )}
        </footer>
      </div>

      {/* 마감 전(pre)·30분 유예(new) 취소 확인창 (CANCEL-PRE-01~07 · CANCEL-NEW-01) */}
      {cancelDialog === 'confirm' ? (
        <div
          data-testid="appt-cancel-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="appt-cancel-confirm-title"
          className="fixed inset-0 z-10 flex items-center justify-center bg-background/80 p-6"
        >
          <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl">
            <h2 id="appt-cancel-confirm-title" className="text-base font-bold">
              {isPending ? '신청을 취소할까요?' : '예약을 취소할까요?'}
            </h2>
            {/* 취소 대상 예약을 다시 적는다 — 다른 예약을 잘못 취소하는 사고를 막는다(CANCEL-PRE-02). */}
            <div className="mt-3 rounded-xl border bg-muted/50 p-3 text-sm">
              <p className="font-semibold">{appointment.patientName} · {relation}</p>
              <p className="mt-1 text-muted-foreground">{when}</p>
              <p className="text-muted-foreground">
                {appointment.deptName} · {appointment.doctorName} 선생님
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCancelDialog(null)}>
                아니요
              </Button>
              <Button type="button" variant="destructive" onClick={confirmCancel}>
                취소합니다
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 마감 후(late) 안내 팝업 — 확인창이 아니라 안내 + 상담/전화 경로 (CANCEL-LATE-01~09) */}
      {cancelDialog === 'late' ? (
        <div
          data-testid="appt-cancel-late-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="appt-cancel-late-title"
          className="fixed inset-0 z-10 flex items-center justify-center bg-background/80 p-6"
        >
          <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2">
                <Clock3 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <div>
                <h2 id="appt-cancel-late-title" className="text-base font-bold">
                  취소 마감 시간이 지났습니다
                </h2>
                {/* N은 설정값(진료 24시간 전) — 의사 이름은 붙이지 않는다(CANCEL-LATE-02·03). */}
                <p className="mt-2 text-sm text-muted-foreground">
                  진료 시작 {DEMO_CANCEL_DEADLINE_HOURS}시간 전까지만 앱에서 취소할 수 있습니다.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  상담 채팅으로 문의하시거나 병원으로 전화해 주세요.
                </p>
              </div>
            </div>

            {/* 전화번호는 테두리 상자로 — 누를 수 있음을 보이게(CANCEL-LATE-06), 주 경로로 올리지 않는다(-09). */}
            <a
              href={`tel:${detail.phone}`}
              className="mt-4 flex items-center gap-3 rounded-xl border p-3 text-sm hover:border-primary hover:bg-primary/5"
            >
              <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>
                <span className="block font-semibold">병원 전화</span>
                <span className="text-muted-foreground">{detail.phone}</span>
              </span>
            </a>

            {/* 빠져나갈 문을 반드시 둔다 — [닫기] / [상담 채팅 연결](오른쪽 진한 버튼) (CANCEL-LATE-05·07). */}
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCancelDialog(null)}>
                닫기
              </Button>
              <Button type="button" className="flex-1" onClick={connectSupportChat}>
                <MessageCircle className="mr-1 h-5 w-5" aria-hidden="true" /> 상담 채팅 연결
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PhoneFrame>
  )
}
