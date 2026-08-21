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

function uniqueDates(appointment: Appointment) {
  return Array.from(new Set([appointment.date, ...getAvailableDates(appointment.doctorName).slice(0, 4)]))
}

function uniqueTimes(appointment: Appointment, date: string) {
  const slots = getSlots(appointment.doctorName, date)
  const times = [appointment.time, ...slots.map((slot) => slot.time)]
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
  const dates = uniqueDates(appointment)
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
              <div className="flex flex-col gap-2">
                {dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    data-testid="change-date"
                    onClick={() => chooseDate(date)}
                    className="flex items-center justify-between rounded-xl border bg-card p-4 text-left hover:border-primary hover:bg-primary/5"
                  >
                    <span className="font-semibold">{formatDateHeader(date)}</span>
                    {date === appointment.date && (
                      <span className="text-xs text-muted-foreground">현재 예약</span>
                    )}
                  </button>
                ))}
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
