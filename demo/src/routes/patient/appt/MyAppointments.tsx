import { CalendarDays, CalendarPlus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { initialAppointments, patients } from '@/mock/data'
import type { Appointment, AppointmentStatus } from '@/mock/types'
import { formatDateHeader } from './format'

const UPCOMING_STATUSES = new Set<Appointment['status']>([
  '예약신청',
  '예약확정',
  '진료대기',
  '접수완료',
])

const relationByName = new Map(patients.map((patient) => [patient.name, patient.relation]))

type AppointmentGroup = {
  date: string
  appointments: Appointment[]
}

// 목록의 상태 글자(LIST-ST-01~08): 홈의 채운 배지와 달리 '조용한 회색 글자'로,
// 정상(예약확정)은 아무 말 없이 '›'만. 순서·대기시간 숫자는 쓰지 않는다(LIST-ST-09).
function listStatusText(status: AppointmentStatus): string | null {
  switch (status) {
    case '예약확정':
      return null // 정상은 말하지 않는다
    case '예약신청':
      return '확인 중'
    case '진료대기':
      return '대기 중'
    case '접수완료':
      return '접수됨'
    default:
      return null
  }
}

function relationRank(appointment: Appointment) {
  return relationByName.get(appointment.patientName) === '본인' ? 0 : 1
}

function upcomingAppointments() {
  return initialAppointments
    .filter((appointment) => UPCOMING_STATUSES.has(appointment.status))
    .sort((left, right) => {
      const dateTime = `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`)
      if (dateTime !== 0) return dateTime
      const relation = relationRank(left) - relationRank(right)
      if (relation !== 0) return relation
      return left.patientName.localeCompare(right.patientName, 'ko')
    })
}

function groupAppointments(appointments: Appointment[]) {
  return appointments.reduce<AppointmentGroup[]>((groups, appointment) => {
    const current = groups[groups.length - 1]
    if (current?.date === appointment.date) {
      current.appointments.push(appointment)
    } else {
      groups.push({ date: appointment.date, appointments: [appointment] })
    }
    return groups
  }, [])
}

/**
 * 예약목록의 한 줄(LIST-ROLE-02: 얇은 줄 · 훑어보고 관리).
 * 홈 카드에 붙는 것(예약번호·QR·순서)은 붙이지 않는다 — 예외는 사전문진 줄 하나뿐(LIST-QNR-01).
 */
function AppointmentRow({ appt }: { appt: Appointment }) {
  const navigate = useNavigate()
  const relation = relationByName.get(appt.patientName) ?? '가족'
  const statusText = listStatusText(appt.status)
  const qnr = appt.questionnaireStatus

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        data-testid="appt-row"
        onClick={() => navigate(`/appt/${appt.id}`)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-primary/5"
      >
        <span className="w-12 shrink-0 text-base font-bold tabular-nums">{appt.time}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span className="font-semibold">{appt.patientName}</span>{' '}
            <span className="text-sm text-muted-foreground">{relation}</span>
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {appt.deptName} · {appt.doctorName} 선생님
          </span>
        </span>
        {statusText && <span className="shrink-0 text-sm text-muted-foreground">{statusText}</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {/* 사전문진 줄 — 목록 줄에 붙는 유일한 예외(LIST-QNR-01). 미작성·작성중만. */}
      {qnr && qnr !== '작성완료' && (
        <button
          type="button"
          data-testid="questionnaire-line"
          onClick={() => navigate('/questionnaire')}
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

export function MyAppointments() {
  const navigate = useNavigate()
  const groups = groupAppointments(upcomingAppointments())

  return (
    <PhoneFrame>
      <div data-testid="my-appointments" className="flex h-full flex-col">
        <ScreenHeader title="나의 예약" icon={<CalendarDays className="h-5 w-5" />} />

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {groups.length === 0 ? (
            // 빈 상태(LIST-EMPTY-01) — '허전'이 아니라 '예약하러 오는 화면'. CTA는 하단 고정 버튼이 담당.
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold">예약된 진료가 없습니다</p>
              <p className="text-sm text-muted-foreground">가까운 날짜로 예약하실 수 있습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <section key={group.date} aria-labelledby={`date-${group.date}`}>
                  <div className="mb-2 flex items-center gap-2 border-b pb-2">
                    <h2 id={`date-${group.date}`} className="text-sm font-bold">
                      {formatDateHeader(group.date)}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {group.appointments.length}건
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {group.appointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} appt={appointment} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>

        <footer className="sticky bottom-0 border-t bg-background p-4">
          <Button type="button" size="lg" className="h-12 w-full text-base" onClick={() => navigate('/book')}>
            <CalendarPlus className="mr-1 h-5 w-5" aria-hidden="true" />+ 새 예약하기
          </Button>
        </footer>
      </div>
    </PhoneFrame>
  )
}
