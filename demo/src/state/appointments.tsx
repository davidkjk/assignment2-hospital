import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Appointment } from '@/mock/types'
import { initialAppointments } from '@/mock/data'

type AppointmentsCtx = {
  appointments: Appointment[]
  addAppointment: (a: Appointment) => void
}

const Ctx = createContext<AppointmentsCtx | null>(null)

/** 홈과 예약 마법사가 예약 목록을 공유한다(예약 완료 시 홈에 반영 — 가짜 반응). */
export function AppointmentsProvider({ children }: { children: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments)

  const addAppointment = useCallback((a: Appointment) => {
    setAppointments((prev) =>
      // 시각 오름차순 유지(HOME-CARD-03)
      [...prev, a].sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)),
    )
  }, [])

  const value = useMemo(() => ({ appointments, addAppointment }), [appointments, addAppointment])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppointments(): AppointmentsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppointments must be used within AppointmentsProvider')
  return ctx
}
