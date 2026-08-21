import { CalendarDays, CalendarPlus, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PhoneFrame } from '@/components/PhoneFrame'
import { initialAppointments, patients } from '@/mock/data'
import type { Appointment } from '@/mock/types'
import { bookingCodeLabel } from '@/mock/types'
import { formatDateHeader } from './format'

/**
 * 나의 예약 목록의 사전문진 줄(LIST-QNR-01·02·03).
 * 미작성 → `사전문진 미작성 · 작성하기` · 작성중 → `사전문진 작성 중 (n/m) · 이어서 쓰기`.
 * 작성완료(02)·값 없음은 줄을 그리지 않는다 — 「지금 할 일이 있는 줄」에만 준다.
 */
function questionnaireLine(appointment: Appointment): string | null {
  switch (appointment.questionnaireStatus) {
    case '미작성':
      return '사전문진 미작성 · 작성하기'
    case '작성중': {
      const p = appointment.questionnaireProgress
      return `사전문진 작성 중${p ? ` (${p.answered}/${p.total})` : ''} · 이어서 쓰기`
    }
    default:
      return null
  }
}

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

function listStatus(status: Appointment['status']) {
  switch (status) {
    case '예약신청':
      return '확인 중'
    case '진료대기':
      return '대기 중'
    case '접수완료':
      return '접수됨'
    case '예약확정':
      return null
  }
}

export function MyAppointments() {
  const navigate = useNavigate()
  const groups = groupAppointments(upcomingAppointments())

  return (
    <PhoneFrame>
      <div data-testid="my-appointments" className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b px-5 py-4">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          <div>
            <p className="text-base font-bold">나의 예약</p>
            <p className="text-xs text-muted-foreground">앞으로 방문할 예약을 확인하세요</p>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {groups.length === 0 ? (
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
                    {group.appointments.map((appointment) => {
                      const relation = relationByName.get(appointment.patientName) ?? '가족'
                      const status = listStatus(appointment.status)
                      const pending = appointment.status === '예약신청'

                      const qnrLine = questionnaireLine(appointment)

                      return (
                        <div key={appointment.id} className="overflow-hidden rounded-xl border bg-card">
                          <button
                            type="button"
                            data-testid="appointment-row"
                            aria-label={`${appointment.patientName} 예약 상세`}
                            onClick={() => navigate(`/appt/${appointment.id}`)}
                            className="flex w-full text-left transition-colors hover:bg-muted"
                          >
                            <div
                              className={`flex w-16 shrink-0 flex-col items-center justify-center gap-1 px-2 py-3 ${
                                pending ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                              }`}
                            >
                              <span className="text-base font-bold tabular-nums">{appointment.time}</span>
                              <span className="text-xs">{relation}</span>
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold">{appointment.patientName}</p>
                                <p className="truncate text-sm text-muted-foreground">
                                  {appointment.deptName} · {appointment.doctorName} 선생님
                                </p>
                                {/* 예약번호(CARD-COMMON-02·03): 확정 전=신청번호 / 확정 후=예약번호 */}
                                {appointment.bookingCode && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {bookingCodeLabel(appointment.status)}{' '}
                                    <span className="font-semibold tabular-nums tracking-wider text-foreground">
                                      {appointment.bookingCode}
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1 text-sm">
                                {status ? (
                                  <span className={pending ? 'text-muted-foreground' : 'text-foreground'}>
                                    {status}
                                  </span>
                                ) : (
                                  <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                                )}
                              </div>
                            </div>
                          </button>

                          {/* 사전문진 줄(LIST-QNR-01·03): 미작성·작성중만. 상자 안 아래에 주의색 한 줄. */}
                          {qnrLine && (
                            <button
                              type="button"
                              data-testid="questionnaire-line"
                              onClick={() => navigate('/questionnaire')}
                              className="flex w-full items-center justify-between border-t border-primary/20 bg-primary/10 px-3 py-2 text-left text-sm font-medium text-primary"
                            >
                              <span>{qnrLine}</span>
                              <span aria-hidden="true">›</span>
                            </button>
                          )}
                        </div>
                      )
                    })}
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
