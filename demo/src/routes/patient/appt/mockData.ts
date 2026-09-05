import { initialAppointments } from '@/mock/data'
import type { Appointment } from '@/mock/types'

export type AppointmentDetailData = {
  place: string
  address: string
  phone: string
  reason?: string
  statusActor: string
  statusAt: string
}

/** 예약 공용 타입에 없는 상세 정보를 예약 id로 보강한다. */
export const appointmentDetails: Record<string, AppointmentDetailData> = {
  'appt-1': {
    place: '가온병원 본관 2층 203호',
    address: '가온병원 본관',
    phone: '02-1234-5678',
    reason: '속이 불편하고 소화가 잘되지 않아요.',
    statusActor: '접수처',
    statusAt: '오늘 오전 8:45',
  },
  'appt-2': {
    place: '가온병원 본관 3층 안과 진료실',
    address: '가온병원 본관',
    phone: '02-1234-5678',
    reason: '정기 안과 검진을 받고 싶어요.',
    statusActor: '병원',
    statusAt: '오늘 오전 9:10',
  },
  'appt-3': {
    place: '가온병원 본관 4층 정형외과 진료실',
    address: '가온병원 본관',
    phone: '02-1234-5678',
    reason: '무릎이 시큰거리고 계단을 오를 때 아파요.',
    statusActor: '접수처',
    statusAt: '오늘 오전 10:20',
  },
  'appt-4': {
    place: '가온병원 별관 1층 이비인후과',
    address: '가온병원 별관',
    phone: '02-1234-5678',
    reason: '코막힘이 오래갑니다.',
    statusActor: '병원',
    statusAt: '이틀 전 오후 2:30',
  },
  'appt-5': {
    place: '가온병원 별관 2층 피부과',
    address: '가온병원 별관',
    phone: '02-1234-5678',
    reason: '피부 발진이 생겼어요.',
    statusActor: '병원',
    statusAt: '5일 전 오전 11:00',
  },
  'appt-6': {
    place: '가온병원 본관 2층 내과 진료실',
    address: '가온병원 본관',
    phone: '02-1234-5678',
    reason: '정기 검진 예약입니다.',
    statusActor: '접수처',
    statusAt: '어제 오후 4:15',
  },
}

const FALLBACK_DETAIL: AppointmentDetailData = {
  place: '가온병원 본관',
  address: '가온병원 본관',
  phone: '02-1234-5678',
  statusActor: '병원',
  statusAt: '오늘',
}

export function getAppointment(id?: string): Appointment {
  return (id ? initialAppointments.find((appointment) => appointment.id === id) : undefined) ?? initialAppointments[0]
}

export function getAppointmentDetailData(id: string) {
  return appointmentDetails[id] ?? FALLBACK_DETAIL
}

/**
 * 취소 등급 — 정본은 세 갈래다(CANCEL-PRE / CANCEL-NEW / CANCEL-LATE).
 * - `pre`  : 마감 전 → 확인창으로 바로 취소.
 * - `new`  : 만든 지 30분 이내 → 마감과 무관하게 바로 취소(CANCEL-NEW-01). 확인창은 pre와 같다.
 * - `late` : 마감 후(진료 24h 이내) → 확인창이 아니라 안내 팝업 → 상담 연결(CANCEL-LATE-01).
 *
 * 실제 앱은 `created_at + 30분`과 병원 설정 마감시간으로 계산한다. 데모는 그 데이터가 없어
 * 예약 날짜(오늘/내일=마감 후)로 흉내 내고, '방금 만든 예약'만 아래 id로 시연한다.
 */
export const DEMO_CANCEL_DEADLINE_HOURS = 24 // 취소 마감 기본값 = 진료 24시간 전(00004_audit_settings)
const JUST_CREATED_APPOINTMENT_IDS = new Set(['appt-3']) // 방금 만든 예약(30분 유예 시연)

export type CancelTier = 'pre' | 'new' | 'late'

export function getCancelTier(id: string): CancelTier {
  if (JUST_CREATED_APPOINTMENT_IDS.has(id)) return 'new'
  const appointment = getAppointment(id)
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round(
    (startOfDay(new Date(appointment.date + 'T00:00:00')).getTime() - startOfDay(new Date()).getTime()) /
      86_400_000,
  )
  // 오늘(0)·내일(1)은 24시간 마감 안이라 이미 마감 후.
  return diffDays <= 1 ? 'late' : 'pre'
}
