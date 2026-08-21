import { useCallback, useState } from 'react'
import type { Department, Doctor, Patient } from '@/mock/types'

export type BookingState = {
  step: number // 1..8
  who?: Patient
  dept?: Department
  doctor?: Doctor
  date?: string
  time?: string
  reason?: string
}

export type BookingField = 'who' | 'dept' | 'doctor' | 'date' | 'time' | 'reason'

// 뒤 단계일수록 앞 값에 의존한다. 앞 값을 바꾸면 뒤 값을 버린다(BOOK-NAV-05).
const ORDER: BookingField[] = ['who', 'dept', 'doctor', 'date', 'time', 'reason']

export const STEP_NAMES = [
  '대상',
  '진료과',
  '의사',
  '날짜',
  '시간',
  '방문이유',
  '최종확인',
  '완료',
] as const

export const TOTAL_STEPS = 8

export function useBookingState() {
  const [state, setState] = useState<BookingState>({ step: 1 })

  const setField = useCallback(<K extends BookingField>(key: K, value: BookingState[K]) => {
    setState((prev) => {
      const idx = ORDER.indexOf(key)
      const cleared: Partial<BookingState> = {}
      for (const later of ORDER.slice(idx + 1)) cleared[later] = undefined
      return { ...prev, [key]: value, ...cleared }
    })
  }, [])

  const next = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.min(prev.step + 1, TOTAL_STEPS) }))
  }, [])

  const back = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(prev.step - 1, 1) }))
  }, [])

  const stepName = STEP_NAMES[state.step - 1]

  return { state, setField, next, back, stepName }
}
