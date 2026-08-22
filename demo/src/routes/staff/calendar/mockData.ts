// 예약 캘린더 가짜 데이터 (CAL-*) — 하루 보기(의사 열).
// 색은 정본 의사 팔레트(CAL-COLOR-12)에서 서로 먼 것부터: 파랑0·짙은초록3·보라8.
// (빨강·주황은 상태색이 쓰므로 의사 색으로 안 씀 — CAL-COLOR-15.)

export type CalendarStatus = '예약확정' | '예약신청' | '도착'
export type SupportType = '취소 상담' | '변경 상담'

/** 화면 시간 창(데모는 오전~점심) */
export const WIN_START = '09:00'
export const WIN_END = '13:30'
export const PX_PER_MIN = 1.5

export interface CalendarDoctor {
  id: string
  name: string
  department: string
  slotMinutes: number
  fill: string // 블록 면 색 (CAL-COLOR-14: 중간 톤 면)
  ink: string // 글자·점 색
}

export interface OffHours {
  doctorId: string
  start: string
  end: string
  kind: '휴진' | '점심시간' // 둘 다 빗금, 글자로 구분 (CAL-SLOT-08)
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
  /** 마감 후 취소·변경 상담이 걸린 예약 (SUPPORT-CAL-*) */
  support?: { type: SupportType; count: number; context: string }
}

export const calendarDoctors: CalendarDoctor[] = [
  { id: 'd1', name: '이정훈', department: '내과', slotMinutes: 20, fill: '#CBDDFF', ink: '#1360A6' },
  { id: 'd2', name: '한서연', department: '내과', slotMinutes: 30, fill: '#B4E8D1', ink: '#0B6C4E' },
  { id: 'd3', name: '박강우', department: '정형외과', slotMinutes: 30, fill: '#E8D5FE', ink: '#6D4F9B' },
]

export const calendarOffHours: OffHours[] = [
  // 박강우 오전 휴진 — 한 덩어리로 (CAL-SLOT-03)
  { doctorId: 'd3', start: '09:00', end: '10:00', kind: '휴진' },
  // 점심은 의사마다 다르다 (CAL-SLOT-09)
  { doctorId: 'd1', start: '12:00', end: '13:00', kind: '점심시간' },
  { doctorId: 'd2', start: '12:30', end: '13:30', kind: '점심시간' },
  { doctorId: 'd3', start: '12:00', end: '13:00', kind: '점심시간' },
]

export const calendarAppointments: CalendarAppointment[] = [
  // ── 이정훈 (내과, 20분) ──
  { id: 'a1', doctorId: 'd1', patientName: '김태호', patientBirth: '1972-11-03', phone: '010-4821-9930', start: '09:00', end: '09:20', status: '예약확정', reason: '고혈압 정기 진료' },
  { id: 'a2', doctorId: 'd1', patientName: '이말녀', patientBirth: '1955-08-17', phone: '010-2841-1043', start: '09:20', end: '09:40', status: '도착', reason: '어지럼증' },
  { id: 'a3', doctorId: 'd1', patientName: '정순남', patientBirth: '1948-05-21', phone: '010-5521-8834', start: '10:00', end: '10:20', status: '예약확정', reason: '속쓰림, 소화불량' },
  { id: 'a4', doctorId: 'd1', patientName: '최민재', patientBirth: '1991-02-09', phone: '010-3372-6610', start: '10:40', end: '11:00', status: '예약신청', reason: '감기 기운, 기침' },
  {
    id: 'a5', doctorId: 'd1', patientName: '윤경아', patientBirth: '1968-07-30', phone: '010-8810-2245', start: '11:20', end: '11:40', status: '예약확정', reason: '두통 재진',
    support: { type: '변경 상담', count: 1, context: '오후 시간으로 옮길 수 있는지 상담이 들어왔습니다.' },
  },

  // ── 한서연 (내과, 30분) ──
  { id: 'b1', doctorId: 'd2', patientName: '박영수', patientBirth: '1980-04-12', phone: '010-6640-9021', start: '09:00', end: '09:30', status: '예약확정', reason: '건강검진 결과 상담' },
  {
    id: 'b2', doctorId: 'd2', patientName: '김하늘', patientBirth: '1995-12-01', phone: '010-2201-7788', start: '09:30', end: '10:00', status: '도착', reason: '복통',
    support: { type: '취소 상담', count: 2, context: '마감 후 취소 문의가 들어와 직원 확인이 필요합니다.' },
  },
  { id: 'b3', doctorId: 'd2', patientName: '이순자', patientBirth: '1951-09-25', phone: '010-4412-5567', start: '10:30', end: '11:00', status: '예약확정', reason: '당뇨 관리' },
  { id: 'b4', doctorId: 'd2', patientName: '정미경', patientBirth: '1987-06-18', phone: '010-7788-3320', start: '11:30', end: '12:00', status: '예약신청', reason: '갑상선 재검' },

  // ── 박강우 (정형외과, 30분, 오전 휴진) ──
  { id: 'c1', doctorId: 'd3', patientName: '한지우', patientBirth: '1999-03-08', phone: '010-9921-4402', start: '10:00', end: '10:30', status: '예약확정', reason: '발목 염좌' },
  { id: 'c2', doctorId: 'd3', patientName: '오세훈', patientBirth: '1976-10-14', phone: '010-3310-8899', start: '10:30', end: '11:00', status: '도착', reason: '어깨 통증' },
  { id: 'c3', doctorId: 'd3', patientName: '신경자', patientBirth: '1959-01-27', phone: '010-6604-1120', start: '11:30', end: '12:00', status: '예약확정', reason: '무릎 관절 재진' },
]

/** 전화 예약 — 환자 찾기(한 칸 통합검색) 재현용 가짜 결과 */
export const patientSearchResults = [
  { id: 'p1', name: '강동훈', birth: '1983-05-11', phone: '010-2211-4590' },
  { id: 'p2', name: '문소희', birth: '1990-08-22', phone: '010-8842-3301' },
  { id: 'p3', name: '조은비', birth: '2001-12-03', phone: '010-5567-9910' },
]
