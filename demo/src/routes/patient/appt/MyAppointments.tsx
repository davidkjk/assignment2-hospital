import { CalendarDays, CalendarPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { AppointmentCard } from '@/components/AppointmentCard'
import { initialAppointments, patients } from '@/mock/data'
import type { Appointment } from '@/mock/types'
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

export function MyAppointments() {
  const navigate = useNavigate()
  const groups = groupAppointments(upcomingAppointments())

  return (
    <PhoneFrame>
      <div data-testid="my-appointments" className="flex h-full flex-col">
        <ScreenHeader title="나의 예약" icon={<CalendarDays className="h-5 w-5" />} />

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

                  <div className="flex flex-col gap-3">
                    {group.appointments.map((appointment) => (
                      <AppointmentCard key={appointment.id} appt={appointment} />
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
