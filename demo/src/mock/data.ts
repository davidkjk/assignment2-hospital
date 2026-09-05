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
    { id: 'doc-im-1', deptId: 'd-im', name: '이정훈', specialty: '소화기내과', scheduleSummary: '월·화·목·금 오전', photoUrl: '/doctors/im-1.jpg' },
    { id: 'doc-im-2', deptId: 'd-im', name: '한서연', specialty: '순환기내과', scheduleSummary: '월·수·금 종일', photoUrl: '/doctors/im-2.jpg' },
  ],
  'd-os': [
    { id: 'doc-os-1', deptId: 'd-os', name: '박강우', specialty: '척추·관절', scheduleSummary: '화·목·금 오후', photoUrl: '/doctors/os-1.jpg' },
    { id: 'doc-os-2', deptId: 'd-os', name: '최다인', specialty: '스포츠의학', scheduleSummary: '월·화·수 오전', photoUrl: '/doctors/os-2.jpg' },
  ],
  'd-ent': [
    { id: 'doc-ent-1', deptId: 'd-ent', name: '정우재', specialty: '비염·이비인후', scheduleSummary: '월~금 오전', photoUrl: '/doctors/ent-1.jpg' },
  ],
  'd-derm': [
    { id: 'doc-derm-1', deptId: 'd-derm', name: '윤지호', specialty: '피부질환', scheduleSummary: '수·목·금 종일', photoUrl: '/doctors/derm-1.jpg' },
  ],
  'd-oph': [
    { id: 'doc-oph-1', deptId: 'd-oph', name: '오세림', specialty: '녹내장·백내장', scheduleSummary: '월·화·목 오후', photoUrl: '/doctors/oph-1.jpg' },
  ],
}

/** 모든 의사를 한 배열로 (조회용) */
export const allDoctors: Doctor[] = Object.values(doctorsByDept).flat()

// ── 날짜/슬롯: 데모라 오늘 기준으로 만들어 항상 미래 날짜가 보이게 한다 ──
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 예약 가능 범위 = 8주(56일). 정본 REGENERATION_WEEKS=8·BOOK-DATE-06(예약은 8주 뒤까지). */
export const BOOKING_WINDOW_DAYS = 56

/**
 * 의사별 예약 가능일: 내일부터 8주(56일) 이내 평일 전부 (BOOK-DATE-02·06).
 * 실제 앱은 서버(list_available_dates)가 8주 내 빈 날짜만 내려준다. 데모는 주말만 진료 없음으로 흉내.
 */
export function getAvailableDates(_doctorId: string, from: Date = new Date()): string[] {
  const dates: string[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const horizon = new Date(cursor)
  horizon.setDate(horizon.getDate() + BOOKING_WINDOW_DAYS)
  cursor.setDate(cursor.getDate() + 1)
  while (cursor <= horizon) {
    const day = cursor.getDay() // 0=일, 6=토
    if (day !== 0 && day !== 6) dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

const MORNING = ['09:00', '09:30', '10:00', '10:30', '11:00']
const AFTERNOON = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30']

// 진료시간이 짧아 10분 간격으로 예약받는 의사(예: 이비인후과 정우재) — 하루 슬롯이 촘촘한 경우 시연.
// 정본 BOOK-TIME-01(오전/오후 3열 격자)이 이런 촘촘함을 압축해 담는다.
const TEN_MIN_DOCTORS = new Set(['doc-ent-1'])

/** 지정 간격으로 시각 문자열을 만든다(예: 09:00~11:50, 10분 간격). */
function timesEvery(startHour: number, endHour: number, stepMin: number): string[] {
  const out: string[] = []
  for (let m = startHour * 60; m < endHour * 60; m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}

/** 의사·날짜별 예약 가능 슬롯. 데모는 요일에 따라 오전/오후 유무만 다르게 한다(BOOK-TIME-01·06). */
export function getSlots(doctorId: string, date: string): Slot[] {
  const weekday = new Date(date + 'T00:00:00').getDay()
  const slots: Slot[] = []

  // 10분 간격 의사: 오전 09~12시·오후 14~17시를 10분마다(하루 칸이 많아지는 경우).
  if (TEN_MIN_DOCTORS.has(doctorId)) {
    timesEvery(9, 12, 10).forEach((t) => slots.push({ time: t, period: '오전' }))
    timesEvery(14, 17, 10).forEach((t) => slots.push({ time: t, period: '오후' }))
    return slots
  }

  // 의사 id 해시로 살짝 다르게: 짝수 의사는 오전만, 홀수는 종일 등 데모용 변주
  const seed = doctorId.length + weekday
  if (seed % 3 !== 0) MORNING.forEach((t) => slots.push({ time: t, period: '오전' }))
  if (seed % 2 === 0) AFTERNOON.forEach((t) => slots.push({ time: t, period: '오후' }))
  // 최소 한 덩어리는 보장
  if (slots.length === 0) MORNING.forEach((t) => slots.push({ time: t, period: '오전' }))
  return slots
}

// ── 초기 예약. 홈은 오늘치만(HOME-SCOPE), 나의 예약 탭은 다가오는 전체를 본다 ──
export const today = toISO(new Date())
function daysFromToday(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export const initialAppointments: Appointment[] = [
  // 오늘 (홈에 보인다)
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
    bookingCode: 'K7P2Q9',
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
    bookingCode: 'M4T8XR',
  },
  {
    id: 'appt-3',
    patientName: '김순자',
    deptName: '정형외과',
    doctorName: '박강우',
    date: today,
    time: '16:30',
    status: '예약신청',
    hasQR: false,
    bookingCode: '3F9WK2',
  },
  // 며칠 뒤 (나의 예약 탭에 보인다)
  {
    id: 'appt-4',
    patientName: '김민준',
    deptName: '이비인후과',
    doctorName: '정우재',
    date: daysFromToday(2),
    time: '10:00',
    status: '예약확정',
    hasQR: true,
    questionnaireStatus: '미작성',
    bookingCode: 'B6N5H1',
  },
  {
    id: 'appt-5',
    patientName: '김순자',
    deptName: '피부과',
    doctorName: '윤지호',
    date: daysFromToday(5),
    time: '11:30',
    status: '예약확정',
    hasQR: true,
    // 작성 중 예약(LIST-QNR-03 · CARD-QNR) — 진행률을 함께 보인다.
    questionnaireStatus: '작성중',
    questionnaireProgress: { answered: 3, total: 8 },
    bookingCode: 'Q2R7YT',
  },
  {
    id: 'appt-6',
    patientName: '박말순',
    deptName: '내과',
    doctorName: '한서연',
    date: daysFromToday(9),
    time: '15:30',
    status: '예약신청',
    hasQR: false,
    bookingCode: 'W8L3P5',
  },
]
