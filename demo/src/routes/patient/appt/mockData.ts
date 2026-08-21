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
