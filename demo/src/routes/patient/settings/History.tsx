import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronDown, ChevronLeft, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { patients } from '@/mock/data'
import type { Patient } from '@/mock/types'
import { historyAppointments, type HistoryAppointment } from './mockData'

const PAGE_SIZE = 20

function formatDateRail(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return {
    month: `${date.getMonth() + 1}월`,
    day: String(date.getDate()),
    weekday: `(${weekdays[date.getDay()]})`,
    year: String(date.getFullYear()),
  }
}

function formatTimestamp(value: string | undefined) {
  if (!value) return ''
  const [dateValue, time] = value.split('T')
  const date = formatDateRail(dateValue)
  const [hour, minute] = (time ?? '').split(':')
  const hourNumber = Number(hour)
  const period = hourNumber >= 12 ? '오후' : '오전'
  const displayHour = hourNumber % 12 || 12
  return `${date.month} ${date.day}일 ${period} ${displayHour}:${minute}`
}

function statusLabel(record: HistoryAppointment) {
  switch (record.status) {
    case '진료완료':
      return '진료 완료'
    case '환자취소':
      return '취소됨 · 본인 취소'
    case '병원취소':
      return '취소됨 · 병원에서 취소'
    case '예약부도':
      return '방문하지 않음'
    case '미확정':
      return '확정되지 않음'
  }
}

function HistoryRow({ record }: { record: HistoryAppointment }) {
  const [expanded, setExpanded] = useState(false)
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)
  const rail = formatDateRail(record.date)
  const isCompleted = record.status === '진료완료'
  const isCancelled = record.status === '환자취소' || record.status === '병원취소'

  return (
    <Card data-testid={`history-row-${record.id}`} className="overflow-visible">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-stretch gap-3 p-4 text-left hover:bg-muted/50"
      >
        <span
          className={`flex w-12 shrink-0 flex-col items-center justify-center border-l-4 pl-2 ${isCompleted && record.note ? 'border-primary' : 'border-muted-foreground/30'}`}
        >
          <span className="text-xs text-muted-foreground">{rail.month}</span>
          <span className="font-mono text-2xl font-semibold leading-none">{rail.day}</span>
          <span className="text-xs text-muted-foreground">{rail.weekday}</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={`truncate font-medium ${isCancelled ? 'line-through' : ''}`}>
              {record.deptName} · {record.doctorName}
            </span>
            <span className="shrink-0 text-muted-foreground">
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </span>
          </span>
          <span className={`mt-1 block text-sm ${isCompleted ? 'text-primary' : 'text-muted-foreground'}`}>
            {statusLabel(record)}
          </span>
          {isCancelled && (
            <span className="mt-1 block text-xs text-muted-foreground">
              취소한 날짜·시각 {formatTimestamp(record.statusAt)}
            </span>
          )}
          {record.status === '미확정' && (
            <span className="mt-1 block text-xs text-muted-foreground">
              병원에서 확정하지 않아 진료가 진행되지 않았습니다
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-4 py-4">
          {isCompleted && (
            <section className="space-y-1">
              <h3 className="text-sm font-semibold">병원 안내</h3>
              <p className="text-sm text-muted-foreground">{record.note ?? '안내 없음'}</p>
            </section>
          )}

          {record.questionnaire && (
            <section className="rounded-lg border bg-muted/30">
              <button
                type="button"
                aria-expanded={questionnaireOpen}
                onClick={() => setQuestionnaireOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm font-medium hover:bg-muted/60"
              >
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  내가 작성한 사전문진
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${questionnaireOpen ? 'rotate-180' : ''}`} />
              </button>
              {questionnaireOpen && (
                <div className="space-y-3 border-t px-3 py-3">
                  {record.questionnaire.map((answer) => (
                    <div key={answer.question} className="space-y-1">
                      <p className="text-xs text-muted-foreground">{answer.question}</p>
                      <p className="text-sm">{answer.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!record.note && !record.questionnaire && !isCompleted && (
            <p className="text-sm text-muted-foreground">이 예약에는 보여드릴 안내가 없습니다.</p>
          )}
        </div>
      )}
    </Card>
  )
}

function patientOrder() {
  const [self, ...family] = patients
  return [self, ...family.sort((left, right) => left.name.localeCompare(right.name))]
}

export function History() {
  const navigate = useNavigate()
  const people = useMemo(patientOrder, [])
  const [selectedPatientId, setSelectedPatientId] = useState(people[0]?.id ?? '')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const selectedHistory = useMemo(
    () => historyAppointments.filter((record) => record.patientId === selectedPatientId),
    [selectedPatientId],
  )
  const visibleHistory = selectedHistory.slice(0, visibleCount)
  const hasMore = visibleCount < selectedHistory.length

  const selectPatient = (patient: Patient) => {
    setSelectedPatientId(patient.id)
    setVisibleCount(PAGE_SIZE)
  }

  let lastYear = ''

  return (
    <PhoneFrame activeTab="history">
      <div data-testid="history" className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate('/home')}
            className="-ml-2 rounded-full p-1 hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold">이력</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          {people.length > 1 && (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="이력 볼 사람">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={person.id === selectedPatientId}
                  onClick={() => selectPatient(person)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm ${person.id === selectedPatientId ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}
                >
                  {person.name}
                </button>
              ))}
            </div>
          )}

          {visibleHistory.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <p className="text-muted-foreground">아직 방문하신 기록이 없습니다</p>
              <Button onClick={() => navigate('/book')}>
                <CalendarPlus className="mr-1 h-4 w-4" /> 진료 예약하기
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleHistory.map((record) => {
                const year = formatDateRail(record.date).year
                const showYear = year !== lastYear
                lastYear = year
                return (
                  <div key={record.id} className="space-y-2">
                    {showYear && <h2 className="pt-2 text-sm font-semibold text-muted-foreground">{year}</h2>}
                    <HistoryRow record={record} />
                  </div>
                )
              })}

              {hasMore ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, selectedHistory.length))}
                >
                  더 보기
                </Button>
              ) : (
                <p className="py-2 text-center text-xs text-muted-foreground">처음부터 모두 보여드렸습니다</p>
              )}
            </div>
          )}
        </main>
      </div>
    </PhoneFrame>
  )
}
