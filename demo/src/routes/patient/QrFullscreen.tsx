import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'
import { useAppointments } from '@/state/appointments'

// QR 전체화면(QR-TITLE-01: 이름 n/m · QR-SWIPE-01: 좌우로 다른 예약 QR).
// 데모라 실제 QR 대신 자리표시 격자. QR 있는 예약만 넘긴다(QR-SWIPE-02).
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
      <div
        data-testid="qr-screen"
        className="relative flex h-full flex-col items-center justify-center gap-6 bg-white p-8"
      >
        <button
          aria-label="닫기"
          className="absolute right-4 top-4 rounded-full bg-neutral-100 p-2"
          onClick={() => navigate(-1)}
        >
          <X className="h-5 w-5" />
        </button>

        {appt ? (
          <>
            {/* QR-TITLE-01: 지금 누구 것인지 + 몇 번째 */}
            <div className="text-center">
              <p className="text-lg font-bold">{appt.patientName}님</p>
              {qrList.length > 1 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {index + 1} / {qrList.length}
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">접수 데스크에 보여주세요</p>

            <div className="grid h-56 w-56 grid-cols-8 grid-rows-8 gap-0.5 rounded-lg border-4 border-neutral-900 p-2">
              {Array.from({ length: 64 }).map((_, i) => (
                <div
                  key={i}
                  className={(i * 7 + index * 5 + 3) % 3 === 0 ? 'bg-neutral-900' : 'bg-transparent'}
                />
              ))}
            </div>

            <p className="text-base font-semibold">
              {appt.deptName} · {appt.doctorName} 선생님
            </p>
            <p className="text-sm text-muted-foreground">
              {appt.date} {appt.time}
            </p>

            {/* QR-SWIPE-01: 데모에서는 좌우 버튼으로 다른 예약 QR 전환 */}
            {qrList.length > 1 && (
              <div className="mt-2 flex items-center gap-6">
                <button
                  aria-label="이전 예약"
                  onClick={prev}
                  disabled={index === 0}
                  className="rounded-full border p-2 disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-xs text-muted-foreground">좌우로 다른 예약 QR</span>
                <button
                  aria-label="다음 예약"
                  onClick={next}
                  disabled={index === qrList.length - 1}
                  className="rounded-full border p-2 disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">표시할 접수 QR이 없습니다</p>
        )}
      </div>
    </PhoneFrame>
  )
}
