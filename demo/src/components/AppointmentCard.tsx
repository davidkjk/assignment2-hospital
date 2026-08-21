import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Appointment } from '@/mock/types'
import { bookingCodeLabel } from '@/mock/types'
import { patients, today } from '@/mock/data'
import { Button } from '@/components/ui/button'
import { StatusBadge, appointmentTone } from '@/components/StatusBadge'

const relationByName = new Map(patients.map((p) => [p.name, p.relation]))

/**
 * 앞으로의 예약 카드 한 장 — 홈과 예약 탭이 같은 부품을 쓴다(레이아웃은 각 화면, 부품은 통일).
 * 왼쪽 채운 시각 블록(시각 + 관계, 대기중=회색) · 이름/과/의사/예약번호 · 채운 상태 배지 ·
 * 오늘 예약이면 접수 QR 버튼 · 미작성/작성중이면 사전문진 줄.
 */
export function AppointmentCard({ appt }: { appt: Appointment }) {
  const navigate = useNavigate()
  const relation = relationByName.get(appt.patientName) ?? '가족'
  const pending = appt.status === '예약신청'
  const isToday = appt.date === today
  const qnr = appt.questionnaireStatus

  return (
    <div
      data-testid="appt-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/appt/${appt.id}`)}
      className="cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex">
        {/* 채운 시각 블록: 시각 + 관계. 대기 중(예약신청)은 회색으로. */}
        <div
          className={`flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-3 ${
            pending ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
          }`}
        >
          <span className="text-base font-bold tabular-nums">{appt.time}</span>
          <span className="text-xs">{relation}</span>
        </div>

        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{appt.patientName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {appt.deptName} · {appt.doctorName} 선생님
              </p>
              {appt.bookingCode && (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {bookingCodeLabel(appt.status)}{' '}
                  <span className="font-semibold tabular-nums tracking-wider text-foreground">
                    {appt.bookingCode}
                  </span>
                </p>
              )}
            </div>
            <StatusBadge label={appt.status} tone={appointmentTone(appt.status)} />
          </div>

          {/* 오늘 예약이면 접수 QR 버튼(당일 행동). 미래 예약은 목록을 가볍게 유지. */}
          {appt.hasQR && isToday && (
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
        </div>
      </div>

      {/* 사전문진 줄(CARD-QNR·LIST-QNR): 미작성·작성중만, 상자 안 아래 주의색 한 줄. */}
      {qnr && qnr !== '작성완료' && (
        <button
          type="button"
          data-testid="questionnaire-line"
          onClick={(e) => {
            e.stopPropagation()
            navigate('/questionnaire')
          }}
          className="flex w-full items-center justify-between border-t border-primary/20 bg-primary/10 px-3 py-2 text-left text-sm font-medium text-primary"
        >
          <span>
            {qnr === '미작성' && '사전문진 미작성 · 작성하기'}
            {qnr === '작성중' &&
              `사전문진 작성 중${
                appt.questionnaireProgress
                  ? ` (${appt.questionnaireProgress.answered}/${appt.questionnaireProgress.total})`
                  : ''
              } · 이어서 쓰기`}
          </span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
