import { useNavigate } from 'react-router-dom'
import type { Appointment } from '@/mock/types'
import { bookingCodeLabel } from '@/mock/types'
import { Button } from '@/components/ui/button'

// 선명한 채운 색으로 상태를 구분한다(어르신 가독성·플랫 테마에서 또렷하게).
// 예약확정=브랜드 딥틸, 예약신청=주황(대기), 진료대기=파랑, 접수완료=보라.
const STATUS_STYLE: Record<Appointment['status'], string> = {
  예약신청: 'bg-amber-500 text-white',
  예약확정: 'bg-primary text-primary-foreground',
  진료대기: 'bg-sky-600 text-white',
  접수완료: 'bg-violet-600 text-white',
}

/** 홈의 예약 카드 한 장. 왼쪽 시각(레일 느낌) + 환자·과·의사 + 상태 배지 + QR(있는 예약만). */
export function AppointmentCard({ appt }: { appt: Appointment }) {
  const navigate = useNavigate()
  return (
    <div
      data-testid="appt-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/appt/${appt.id}`)}
      className="flex cursor-pointer gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
    >
      {/* 시각 레일 */}
      <div className="flex w-14 shrink-0 flex-col items-center">
        <span className="text-lg font-bold tabular-nums text-primary">{appt.time}</span>
        <span className="mt-1 h-full w-px flex-1 bg-primary/25" />
      </div>

      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold">{appt.patientName}</p>
            <p className="text-sm text-muted-foreground">
              {appt.deptName} · {appt.doctorName} 선생님
            </p>
            {/* 예약번호(CARD-COMMON-01·02·03): 확정 전=신청번호 / 확정 후=예약번호. QR이 안 될 때 접수에 불러 주는 번호. */}
            {appt.bookingCode && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {bookingCodeLabel(appt.status)}{' '}
                <span className="font-semibold tabular-nums tracking-wider text-foreground">
                  {appt.bookingCode}
                </span>
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[appt.status]}`}
          >
            {appt.status}
          </span>
        </div>

        {appt.hasQR && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={(e) => {
              e.stopPropagation()
              navigate('/qr')
            }}
          >
            접수 QR 보기
          </Button>
        )}

        {/* 사전문진 줄 (CARD-QNR-01·02·03): 미작성·작성중=강조, 작성완료=회색. 클릭 시 문진 화면. */}
        {appt.questionnaireStatus && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              // 작성완료면 확인 화면으로(NAV-QNR-03), 그 외(미작성·작성중)는 문진으로(NAV-QNR-01).
              navigate(
                '/questionnaire',
                appt.questionnaireStatus === '작성완료' ? { state: { review: true } } : undefined,
              )
            }}
            className={`mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
              appt.questionnaireStatus === '작성완료'
                ? 'text-muted-foreground'
                : 'bg-primary/10 text-primary ring-1 ring-primary/30'
            }`}
          >
            <span>
              {appt.questionnaireStatus === '미작성' && '사전문진 미작성 · 작성하기'}
              {appt.questionnaireStatus === '작성중' &&
                `사전문진 작성 중${
                  appt.questionnaireProgress
                    ? ` (${appt.questionnaireProgress.answered}/${appt.questionnaireProgress.total})`
                    : ''
                } · 이어서 쓰기`}
              {appt.questionnaireStatus === '작성완료' && '사전문진 작성완료 · 수정하기'}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </div>
  )
}
