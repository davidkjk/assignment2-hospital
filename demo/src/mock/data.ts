import type { Appointment, Department, Doctor, Patient, Slot } from './types'

// ── 환자(본인 + 연결된 가족). 본인이 맨 위(HOME-CARD-03 / BOOK-WHO-01) ──
export const patients: Patient[] = [
  { id: 'p-self', name: '김순자', relation: '본인' },
  { id: 'p-mom', name: '박말순', relation: '어머니' },
  { id: 'p-son', name: '김민준', relation: '아들' },
]

// ── 진료과 ──
export const departments: Department[] = [
  { id: 'd-im', name: '내과' },
  { id: 'd-os', name: '정형외과' },
  { id: 'd-ent', name: '이비인후과' },
  { id: 'd-derm', name: '피부과' },
  { id: 'd-oph', name: '안과' },
]

// ── 진료과별 의사 ──
export const doctorsByDept: Record<string, Doctor[]> = {
  'd-im': [
    { id: 'doc-im-1', deptId: 'd-im', name: '이정훈', specialty: '소화기내과', scheduleSummary: '월·화·목·금 오전' },
    { id: 'doc-im-2', deptId: 'd-im', name: '한서연', specialty: '순환기내과', scheduleSummary: '월·수·금 종일' },
  ],
  'd-os': [
    { id: 'doc-os-1', deptId: 'd-os', name: '박강우', specialty: '척추·관절', scheduleSummary: '화·목·금 오후' },
    { id: 'doc-os-2', deptId: 'd-os', name: '최다인', specialty: '스포츠의학', scheduleSummary: '월·화·수 오전' },
  ],
  'd-ent': [
    { id: 'doc-ent-1', deptId: 'd-ent', name: '정우재', specialty: '비염·이비인후', scheduleSummary: '월~금 오전' },
  ],
  'd-derm': [
    { id: 'doc-derm-1', deptId: 'd-derm', name: '윤지호', specialty: '피부질환', scheduleSummary: '수·목·금 종일' },
  ],
  'd-oph': [
    { id: 'doc-oph-1', deptId: 'd-oph', name: '오세림', specialty: '녹내장·백내장', scheduleSummary: '월·화·목 오후' },
  ],
}

/** 모든 의사를 한 배열로 (조회용) */
export const allDoctors: Doctor[] = Object.values(doctorsByDept).flat()

// ── 날짜/슬롯: 데모라 오늘 기준으로 만들어 항상 미래 날짜가 보이게 한다 ──
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 의사별 예약 가능일: 오늘 이후 평일 중 앞 8일 (BOOK-DATE-02) */
export function getAvailableDates(_doctorId: string, from: Date = new Date()): string[] {
  const dates: string[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  while (dates.length < 8) {
    cursor.setDate(cursor.getDate() + 1)
    const day = cursor.getDay() // 0=일, 6=토
    if (day !== 0 && day !== 6) dates.push(toISO(cursor))
  }
  return dates
}

const MORNING = ['09:00', '09:30', '10:00', '10:30', '11:00']
const AFTERNOON = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30']

/** 의사·날짜별 예약 가능 슬롯. 데모는 요일에 따라 오전/오후 유무만 다르게 한다(BOOK-TIME-01·06). */
export function getSlots(doctorId: string, date: string): Slot[] {
  const weekday = new Date(date + 'T00:00:00').getDay()
  // 의사 id 해시로 살짝 다르게: 짝수 의사는 오전만, 홀수는 종일 등 데모용 변주
  const seed = doctorId.length + weekday
  const slots: Slot[] = []
  if (seed % 3 !== 0) MORNING.forEach((t) => slots.push({ time: t, period: '오전' }))
  if (seed % 2 === 0) AFTERNOON.forEach((t) => slots.push({ time: t, period: '오후' }))
  // 최소 한 덩어리는 보장
  if (slots.length === 0) MORNING.forEach((t) => slots.push({ time: t, period: '오전' }))
  return slots
}

// ── 홈에 보일 초기 예약(시각 오름차순, 본인 우선) ──
const today = toISO(new Date())
export const initialAppointments: Appointment[] = [
  {
    id: 'appt-1',
    patientName: '김순자',
    deptName: '내과',
    doctorName: '이정훈',
    date: today,
    time: '09:30',
    status: '진료대기',
    hasQR: true,
    questionnaireStatus: '작성완료',
  },
  {
    id: 'appt-2',
    patientName: '박말순',
    deptName: '안과',
    doctorName: '오세림',
    date: today,
    time: '14:00',
    status: '예약확정',
    hasQR: true,
    questionnaireStatus: '미작성',
  },
]
