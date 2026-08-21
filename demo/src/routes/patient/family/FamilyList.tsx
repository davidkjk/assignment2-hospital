import { useState } from 'react'
import { CalendarDays, ChevronRight, Pencil, Users, UserRoundPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { initialAppointments } from '@/mock/data'
import type { Appointment } from '@/mock/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FamilyDialog, FamilyPage } from './FamilyPage'
import { useFamilyStore } from './familyState'
import { formatBirthDate, genderLabel } from './mockData'
import type { FamilyMember } from './mockData'

const upcomingStatuses = new Set<Appointment['status']>([
  '예약신청',
  '예약확정',
  '진료대기',
  '접수완료',
])

function upcomingAppointmentFor(member: FamilyMember): Appointment | undefined {
  return initialAppointments
    .filter((appointment) => appointment.patientName === member.name)
    .filter((appointment) => upcomingStatuses.has(appointment.status))
    .sort((left, right) => `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`))[0]
}

function appointmentDateLabel(appointment: Appointment): string {
  const [, month, day] = appointment.date.split('-')
  return `${Number(month)}월 ${Number(day)}일 ${appointment.time}`
}

function MemberCard({ member, onEdit, onAppointment }: {
  member: FamilyMember
  onEdit: () => void
  onAppointment: (appointment: Appointment) => void
}) {
  const appointment = upcomingAppointmentFor(member)

  return (
    <Card data-testid={`family-member-${member.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{member.relation}</span>
              <h2 className="truncate text-base font-bold">{member.name}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatBirthDate(member.birthDate)} · {genderLabel(member.gender)}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> 정보 수정
          </Button>
        </div>

        {appointment ? (
          <button
            type="button"
            data-testid={`family-appointment-${appointment.id}`}
            onClick={() => onAppointment(appointment)}
            className="mt-4 flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span>
                {appointmentDateLabel(appointment)} · {appointment.deptName}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function FamilyList() {
  const navigate = useNavigate()
  const { self, members } = useFamilyStore()
  const [showMaxNotice, setShowMaxNotice] = useState(false)
  const activeMembers = members
    .filter((member) => member.isActive)
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'))

  return (
    <FamilyPage testId="family-list" title="가족 관리" icon={<Users className="h-5 w-5" />}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          본인과 연결된 가족의 정보를 관리할 수 있어요.
        </p>

        <MemberCard
          member={self}
          onEdit={() => navigate(`/family/${self.id}/edit`)}
          onAppointment={(appointment) => navigate(`/appt/${appointment.id}`)}
        />

        {activeMembers.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            onEdit={() => navigate(`/family/${member.id}/edit`)}
            onAppointment={(appointment) => navigate(`/appt/${appointment.id}`)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-1 w-full"
          onClick={() => {
            if (activeMembers.length >= 10) setShowMaxNotice(true)
            else navigate('/family/add')
          }}
        >
          <UserRoundPlus className="mr-1 h-5 w-5" /> 가족 추가하기
        </Button>
      </div>

      {showMaxNotice ? (
        <FamilyDialog testId="family-max-dialog" title="가족을 더 추가할 수 없어요" onClose={() => setShowMaxNotice(false)}>
          <p>가족은 최대 10명까지 등록하실 수 있습니다.</p>
          <p className="mt-2 text-muted-foreground">더 필요하시면 병원에 문의해 주세요.</p>
        </FamilyDialog>
      ) : null}
    </FamilyPage>
  )
}
