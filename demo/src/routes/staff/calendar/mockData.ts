export type CalendarStatus = '예약확정' | '예약신청' | '도착'
export type SupportType = '취소 상담' | '변경 상담'

export interface CalendarDoctor {
  id: string
  name: string
  department: string
  slotMinutes: number
}

export interface CalendarAppointment {
  id: string
  doctorId: string
  patientName: string
  patientBirth: string
  phone: string
  start: string
  end: string
  status: CalendarStatus
  reason: string
  support?: { type: SupportType; count: number; context: string }
}

export const calendarDoctors: CalendarDoctor[] = [
  { id: 'd1', name: '이정훈', department: '내과', slotMinutes: 20 },
  { id: 'd2', name: '한서연', department: '내과', slotMinutes: 30 },
  { id: 'd3', name: '박강우', department: '정형외과', slotMinutes: 30 },
]

export const calendarAppointments: CalendarAppointment[] = [
  {
    id: 'a1',
    doctorId: 'd1',
    patientName: '김태호',
    patientBirth: '1972-11-03',
    phone: '010-4821-9930',
    start: '09:00',
    end: '09:20',
    status: '예약확정',
    reason: '고혈압 정기 진료',
  },
  {
    id: 'a2',
    doctorId: 'd2',
    patientName: '이말녀',
    patientBirth: '1955-08-17',
    phone: '010-2841-1043',
    start: '09:30',
    end: '10:00',
    status: '도착',
    reason: '어지럼증',
    support: { type: '변경 상담', count: 1, context: '오후 시간으로 변경할 수 있는지 문의함' },
  },
  {
    id: 'a3',
    doctorId: 'd3',
    patientName: '정순남',
    patientBirth: '1948-05-21',
    phone: '010-5521-8834',
    start: '10:00',
    end: '10:30',
    status: '예약확정',
    reason: '우측 무릎 통증',
    support: { type: '취소 상담', count: 2, context: '당일 일정으로 방문이 어렵다고 상담으로 연결됨' },
  },
  {
    id: 'a4',
    doctorId: 'd1',
    patientName: '한지아',
    patientBirth: '1995-01-19',
    phone: '010-3092-7788',
    start: '11:00',
    end: '11:20',
    status: '예약신청',
    reason: '감기 증상',
  },
]

export const calendarTimes = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']

export const bookingPatients = [
  { id: 'p1', name: '김하늘', birth: '1998-02-14', phone: '010-4821-2201' },
  { id: 'p2', name: '박수정', birth: '1975-03-22', phone: '010-7734-2201' },
  { id: 'p3', name: '조현우', birth: '1982-06-04', phone: '010-9092-1043' },
]
