// [SCHED-*] /admin/schedule 표시층 공용 타입. 백엔드 계약: backend/app/routers/schedule_admin.py
// ⭐ 요구사항 3.7의 일곱 가지 중 다섯이 「의사 × 요일」마다 따로 저장된다(doctor_schedule_rules.unique(doctor_id, weekday)).
//    그래서 한 의사당 7벌의 폼(WeekRow[])을 다룬다.

/** 한 의사·한 요일의 규칙 한 줄. 서버는 늘 요일 0~6 일곱 줄을 준다(SCHED-WEEK-02, 없는 요일은 쉬는 날 빈 줄). */
export interface WeekRow {
  weekday: number // 월=0 … 일=6 (Python date.weekday()와 같다)
  is_day_off: boolean
  start: string | null // "09:00" 또는 서버 "09:00:00"
  end: string | null
  slot_minutes: number | null
  lunch_start: string | null
  lunch_end: string | null
  max_daily: number | null
  booking_deadline: string | null
}

/** 전체 현황 격자 한 행(행=활성 의사, SCHED-GRID-01). */
export interface OverviewDoctor {
  doctor_id: string
  name: string
  department: string | null
  days: WeekRow[] // 7개
}

export interface Department {
  id: string
  name: string
  is_active: boolean
}

/** 병원 요일별 운영시간 한 줄(SCHED-HOURS-*). 접수 창구가 열려 있는 시간 — 의사 진료시간과 다르다. */
export interface HospitalHoursRow {
  weekday: number
  is_closed: boolean
  open_time: string | null
  close_time: string | null
  lunch_start: string | null
  lunch_end: string | null
}

/** 특정 날짜 변경 한 줄(SCHED-EXC-*). scope='hospital'이면 병원 전체 휴무, 아니면 의사별 지정. */
export interface DateException {
  id: string
  exception_date: string // "2026-08-17"
  scope: 'hospital' | 'doctor'
  doctor_id: string | null
  doctor_name: string | null
  is_closed: boolean
  override_start: string | null
  override_end: string | null
  memo: string | null
  affected_count: number
}

export const WEEKDAY_FULL = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'] as const
export const WEEKDAY_SHORT = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 서버 시각("09:00:00")·부분 입력을 "HH:MM"으로. 빈 값이면 ''. */
export function hhmm(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 5)
}
