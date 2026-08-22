import { CalendarDays, Check, Clock3 } from 'lucide-react'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PhoneFrame } from '@/components/PhoneFrame'
import { getAvailableDates, getSlots } from '@/mock/data'
import type { Appointment, Slot } from '@/mock/types'
import { formatDateHeader, formatTime } from './format'
import { getAppointment } from './mockData'

type ChangeStep = 'date' | 'time'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function uniqueTimes(appointment: Appointment, date: string) {
  const slots = getSlots(appointment.doctorName, date)
  const times = [...slots.map((slot) => slot.time)]
  // 원래 날짜로 되돌아온 경우엔 현재 시각도 후보에 넣는다
  if (date === appointment.date) times.unshift(appointment.time)
  return Array.from(new Set(times))
}

function periodSlots(times: string[], period: Slot['period']) {
  return times.filter((time) => (Number(time.slice(0, 2)) < 12 ? '오전' : '오후') === period)
}

export function ApptChange() {
  const navigate = useNavigate()
  const { id } = useParams()
  const appointment = getAppointment(id)
  const [step, setStep] = useState<ChangeStep>('date')
  const [selectedDate, setSelectedDate] = useState<string>()
  const [pendingTime, setPendingTime] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // 예약 마법사 4단계와 같은 월 달력(APPT-CHG-05·BOOK-DATE-01). 같은 진료과·의사 기준.
  const available = new Set([appointment.date, ...getAvailableDates(appointment.doctorName)])
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const times = selectedDate ? uniqueTimes(appointment, selectedDate) : []

  const chooseDate = (date: string) => {
    setSelectedDate(date)
    setPendingTime(undefined)
    setStep('time')
  }

  const chooseTime = (time: string) => {
    setPendingTime(time)
    setConfirmOpen(true)
  }

  const confirmChange = () => {
    if (!selectedDate || !pendingTime) return
    const changedAppointment: Appointment = {
      ...appointment,
      date: selectedDate,
      time: pendingTime,
      status: '예약신청',
      hasQR: false,
    }
    navigate(`/appt/${appointment.id}`, {
      replace: true,
      state: { changedAppointment, changeComplete: true },
    })
  }

  return (
    <PhoneFrame>
      <div data-testid="appt-change" className="flex h-full flex-col">
        <ScreenHeader title="예약 변경" onBack={() => navigate(-1)} />
        <div className="flex items-center gap-3 bg-muted px-5 py-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
            <div className={`h-full bg-primary transition-all ${step === 'date' ? 'w-1/2' : 'w-full'}`} />
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
            {step === 'date' ? '1단계 / 2단계 · 날짜' : '2단계 / 2단계 · 시간'}
          </span>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">같은 진료과·의사로 변경합니다</p>
            <p className="mt-1 font-bold">
              {appointment.deptName} · {appointment.doctorName} 선생님
            </p>
            <p className="mt-2 text-sm text-muted-foreground">현재 {formatDateHeader(appointment.date)} {formatTime(appointment.time)}</p>
          </div>

          {step === 'date' ? (
            <section aria-labelledby="change-date-title">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                <h1 id="change-date-title" className="text-lg font-bold">변경할 날짜를 골라주세요</h1>
              </div>
              <p className="mb-4 text-center text-base font-semibold">
                {year}년 {month + 1}월
              </p>

              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1 text-xs font-semibold text-muted-foreground">
                    {w}
                  </div>
                ))}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} />
                  const date = iso(year, month, day)
                  const ok = available.has(date)
                  const isCurrent = date === appointment.date
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={!ok}
                      data-testid={ok ? 'change-date' : undefined}
                      onClick={() => chooseDate(date)}
                      className={
                        'relative aspect-square rounded-full text-sm ' +
                        (ok
                          ? 'border-2 border-primary font-bold hover:bg-primary hover:text-primary-foreground'
                          : 'text-muted-foreground/40')
                      }
                    >
                      {day}
                      {isCurrent && (
                        <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 범례(BOOK-DATE-04) + 현재 예약 표시 */}
              <div className="mt-5 flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border-2 border-primary" /> 예약 가능
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-muted" /> 진료 없음
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" /> 현재 예약
                </span>
              </div>
            </section>
          ) : (
            <section aria-labelledby="change-time-title">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h1 id="change-time-title" className="text-lg font-bold">변경할 시간을 골라주세요</h1>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep('date')}>
                  날짜 다시 고르기
                </Button>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{selectedDate && formatDateHeader(selectedDate)}</p>

              <div className="space-y-5">
                {(['오전', '오후'] as const).map((period) => {
                  const periodTimes = periodSlots(times, period)
                  if (periodTimes.length === 0) return null
                  return (
                    <div key={period}>
                      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{period}</h2>
                      <div className="grid grid-cols-3 gap-2">
                        {periodTimes.map((time) => (
                          <button
                            key={time}
                            type="button"
                            data-testid="change-time"
                            onClick={() => chooseTime(time)}
                            className="rounded-xl border bg-card px-2 py-3 text-sm font-semibold hover:border-primary hover:bg-primary/5"
                          >
                            {formatTime(time)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </main>

        {confirmOpen && selectedDate && pendingTime && (
          <div className="fixed inset-0 z-20 flex items-end justify-center bg-background/80 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-confirm-title"
              className="w-full max-w-[358px] rounded-2xl border bg-card p-5 shadow-xl"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="change-confirm-title" className="font-bold">이 시간으로 예약을 변경할까요?</h2>
                  <p className="mt-2 text-sm text-muted-foreground">변경 전 · {formatDateHeader(appointment.date)} {formatTime(appointment.time)}</p>
                  <p className="text-sm font-semibold">변경 후 · {formatDateHeader(selectedDate)} {formatTime(pendingTime)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                  아니요
                </Button>
                <Button type="button" onClick={confirmChange}>
                  변경합니다
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
