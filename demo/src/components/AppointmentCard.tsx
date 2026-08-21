import { useNavigate } from 'react-router-dom'
import type { Appointment } from '@/mock/types'
import { Button } from '@/components/ui/button'

const STATUS_STYLE: Record<Appointment['status'], string> = {
  예약신청: 'bg-amber-100 text-amber-800',
  예약확정: 'bg-emerald-100 text-emerald-800',
  진료대기: 'bg-sky-100 text-sky-800',
  접수완료: 'bg-violet-100 text-violet-800',
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
      className="flex cursor-pointer gap-3 rounded-2xl border bg-card p-4 hover:bg-muted/50"
    >
      {/* 시각 레일 */}
      <div className="flex w-14 shrink-0 flex-col items-center">
        <span className="text-lg font-bold tabular-nums">{appt.time}</span>
        <span className="mt-1 h-full w-px flex-1 bg-border" />
      </div>

      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-bold">{appt.patientName}</p>
            <p className="text-sm text-muted-foreground">
              {appt.deptName} · {appt.doctorName} 선생님
            </p>
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

        {/* 사전문진 줄 (CARD-QNR-01·02): 미작성=강조, 작성완료=회색. 클릭 시 문진 화면. */}
        {appt.questionnaireStatus && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              // 작성완료면 확인 화면으로(NAV-QNR-03), 미작성이면 1번 문항부터(NAV-QNR-01).
              navigate(
                '/questionnaire',
                appt.questionnaireStatus === '작성완료' ? { state: { review: true } } : undefined,
              )
            }}
            className={`mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
              appt.questionnaireStatus === '미작성'
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground'
            }`}
          >
            <span>
              {appt.questionnaireStatus === '미작성'
                ? '사전문진 미작성 · 작성하기'
                : '사전문진 작성완료 · 수정하기'}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </div>
  )
}
