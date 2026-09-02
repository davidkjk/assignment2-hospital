import { Button } from '@/components/ui/button'
import { DoctorAvatar } from '@/components/DoctorAvatar'
import { useAppointments } from '@/state/appointments'
import type { Appointment } from '@/mock/types'
import type { StepProps } from '../BookingWizard'

// 7단계 — 최종 확인(BOOK-NAV-06 읽기 전용 요약). [예약하기]가 예약을 만들고 8단계로.
export function Step7Confirm({ wizard }: { wizard: StepProps }) {
  const { state, next } = wizard
  const { addAppointment } = useAppointments()

  const rows: [string, string][] = [
    ['대상', state.who?.name ?? '-'],
    ['진료과', state.dept?.name ?? '-'],
    ['의사', state.doctor ? `${state.doctor.name} 선생님` : '-'],
    ['날짜', state.date ?? '-'],
    ['시간', state.time ?? '-'],
    ['방문 이유', state.reason?.trim() ? state.reason : '(입력 안 함)'],
  ]

  const confirm = () => {
    if (!state.who || !state.dept || !state.doctor || !state.date || !state.time) return
    const appt: Appointment = {
      id: `appt-${Date.now()}`,
      patientName: state.who.name,
      deptName: state.dept.name,
      doctorName: state.doctor.name,
      date: state.date,
      time: state.time,
      status: '예약확정', // 데모: 자동확정 기본(AD-051)
      hasQR: true,
    }
    addAppointment(appt)
    next()
  }

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-5 text-xl font-bold">이대로 예약할까요?</h1>

      <div className="divide-y rounded-2xl bg-card shadow-(--elevation-card)">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm text-muted-foreground">{k}</span>
            {k === '의사' && state.doctor ? (
              <span className="flex items-center gap-2 text-right text-sm font-semibold">
                <DoctorAvatar seed={state.doctor.name} name={state.doctor.name} photoUrl={state.doctor.photoUrl} className="h-7 w-7" />
                {v}
              </span>
            ) : (
              <span className="text-right text-sm font-semibold">{v}</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Button size="lg" className="h-12 w-full text-base" onClick={confirm}>
          이대로 예약하기
        </Button>
      </div>
    </div>
  )
}
