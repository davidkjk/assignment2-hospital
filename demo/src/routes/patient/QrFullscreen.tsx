import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from '@/components/icons'
import { PhoneFrame } from '@/components/PhoneFrame'
import { QrGraphic } from '@/components/QrGraphic'
import { useAppointments } from '@/state/appointments'
import { formatAppointmentDateTime } from '@/routes/patient/appt/format'

// QR 전체화면(QR-TITLE-01: 이름 n/m · QR-SWIPE-01: 좌우로 다른 예약 QR).
// 하나의 흰 QR 카드에 코드+예약번호를 담고, 이름·안내·예약정보를 위아래로 정리한다.
export function QrFullscreen() {
  const navigate = useNavigate()
  const { appointments } = useAppointments()
  const qrList = appointments.filter((a) => a.hasQR)
  const [index, setIndex] = useState(0)
  const appt = qrList[index]

  const prev = () => setIndex((i) => Math.max(i - 1, 0))
  const next = () => setIndex((i) => Math.min(i + 1, qrList.length - 1))

  return (
    <PhoneFrame>
      <div data-testid="qr-screen" className="relative flex h-full flex-col bg-background">
        <button
          aria-label="닫기"
          className="absolute right-4 top-4 z-10 rounded-full bg-card p-2 shadow-sm"
          onClick={() => navigate(-1)}
        >
          <X className="h-5 w-5" />
        </button>

        {appt ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
              <div className="text-center">
                <p className="text-xl font-bold">{appt.patientName}님</p>
                <p className="mt-1 text-sm text-muted-foreground">병원 접수 데스크에 보여주세요</p>
              </div>

              {/* 흰 QR 카드 — QR + 예약번호 */}
              <div className="w-full max-w-[280px] rounded-3xl bg-card p-6 shadow-(--elevation-card)">
                <div className="mx-auto w-full max-w-[216px]">
                  <QrGraphic value={appt.bookingCode ?? appt.id} className="aspect-square w-full" />
                </div>
                {appt.bookingCode && (
                  <div className="mt-5 border-t pt-4 text-center">
                    <p className="text-xs text-muted-foreground">예약번호 (QR이 안 될 때)</p>
                    <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-[0.2em]">{appt.bookingCode}</p>
                  </div>
                )}
              </div>

              <div className="text-center">
                <p className="font-semibold">
                  {appt.deptName} · {appt.doctorName} 선생님
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatAppointmentDateTime(appt.date, appt.time)}
                </p>
              </div>
            </div>

            {/* QR-SWIPE-01: 좌우로 다른 예약 QR 전환 + 몇 번째인지 */}
            {qrList.length > 1 && (
              <div className="flex items-center justify-center gap-6 pb-8">
                <button
                  aria-label="이전 예약"
                  onClick={prev}
                  disabled={index === 0}
                  className="rounded-full bg-card p-2 shadow-sm disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-medium text-muted-foreground">
                  {index + 1} / {qrList.length}
                </span>
                <button
                  aria-label="다음 예약"
                  onClick={next}
                  disabled={index === qrList.length - 1}
                  className="rounded-full bg-card p-2 shadow-sm disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">표시할 접수 QR이 없습니다</p>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
