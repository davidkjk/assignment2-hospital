// 세 문(예약·등록·접수) 공용 가짜 데이터·슬롯 계산.
// 정본: F-4(헤더 세 문) · PANEL-WORK-01/02 · CAL-BOOK-* · QUEUE-WALK-*.
// 의사 로스터·예약·휴진은 예약 캘린더와 같은 원본을 재사용해 화면 사이 값이 어긋나지 않게 한다.
import {
  calendarAppointments,
  calendarDoctors,
  calendarOffHours,
  type CalendarDoctor,
} from '../calendar/mockData'

export type DoorId = 'reserve' | 'register' | 'checkin'
export type FieldId = 'patient' | 'doctor' | 'date' | 'time' | 'find' | null

export interface PatientLite {
  id: string
  name: string
  birth: string
  tel: string
  lastVisit?: string
  today?: { status: string; time: string; dept: string; doctor: string }
}

export type DoctorLite = CalendarDoctor

export const doorDoctors = calendarDoctors

/** 의사별 오늘 대기 인원 (QUEUE-WALK-08b — 창구에서 "덜 기다리는 의사"로 고른다) */
export const doctorWaitMap: Record<string, number> = {
  d1: 3, d2: 1, d3: 2, d4: 0, d5: 4, d6: 1, d7: 2, d8: 0,
}

// ── 환자 검색 결과(통합 검색, SEARCH-BOX-01) — /patients와 같은 표를 왼쪽에 편다 ──
export const doorPatients: PatientLite[] = [
  { id: 'p1', name: '김태호', birth: '1972-11-03', tel: '010-4821-9930', lastVisit: '2026-06-10', today: { status: '진료 대기', time: '09:05', dept: '내과', doctor: '이정훈' } },
  { id: 'p2', name: '김하늘', birth: '1995-12-01', tel: '010-2201-7788', lastVisit: '2026-05-02', today: { status: '도착', time: '09:20', dept: '내과', doctor: '한서연' } },
  { id: 'p3', name: '김서준', birth: '1965-07-30', tel: '010-3311-8842', lastVisit: '2026-07-21' },
  { id: 'p4', name: '이수진', birth: '1975-09-08', tel: '010-2841-5678', lastVisit: '2026-08-01' },
  { id: 'p5', name: '이말녀', birth: '1955-08-17', tel: '010-2841-1043', lastVisit: '2026-03-15', today: { status: '진료 중', time: '09:00', dept: '내과', doctor: '한서연' } },
  { id: 'p6', name: '박강우', birth: '1980-01-22', tel: '010-7734-2201', lastVisit: '2026-04-11' },
  { id: 'p7', name: '정순남', birth: '1948-05-21', tel: '010-5521-8834', lastVisit: '2026-08-20', today: { status: '미도착', time: '11:00', dept: '정형외과', doctor: '박강우' } },
  { id: 'p8', name: '조현우', birth: '1982-06-04', tel: '010-9092-1043', lastVisit: '2025-12-30' },
  { id: 'p9', name: '한지아', birth: '1995-01-19', tel: '010-3092-7788', lastVisit: '2026-02-18' },
  { id: 'p10', name: '윤도현', birth: '1990-02-28', tel: '010-3092-1043', lastVisit: '2026-06-30' },
  { id: 'p11', name: '문소희', birth: '1990-08-22', tel: '010-8842-3301', lastVisit: '2026-07-04' },
  { id: 'p12', name: '조은비', birth: '2001-12-03', tel: '010-5567-9910', lastVisit: '2026-05-28' },
  { id: 'p13', name: '강동훈', birth: '1983-05-11', tel: '010-2211-4590', lastVisit: '2026-08-12' },
]

/** 통합 검색 — 이름·전화·생년 어디에 걸려도 찾는다(번호가 바뀌어도 이름으로, SEARCH-BOX-01) */
export function searchPatients(q: string): PatientLite[] {
  const s = q.trim().toLowerCase()
  if (!s) return doorPatients
  return doorPatients.filter(
    (p) =>
      p.name.toLowerCase().includes(s) ||
      p.tel.replace(/-/g, '').includes(s.replace(/-/g, '')) ||
      p.birth.includes(s),
  )
}

/** 새 환자 폼과 강하게 겹치는 기존 환자(전화 끝자리+생년) — 소프트 확인용(막지 않음) */
export function findDuplicate(tel: string, birth: string): PatientLite | undefined {
  const t = tel.replace(/-/g, '')
  if (t.length < 8) return undefined
  return doorPatients.find((p) => p.tel.replace(/-/g, '') === t || (birth.length >= 8 && p.birth === birth))
}

// ── 의사 하루 일정(일간 캘린더 도구) ──
const WIN_START = 9 * 60 // 09:00
const WIN_END = 18 * 60 // 18:00

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── 비례 캘린더용(분 단위) ── CAL-TIME-02(길이 비례)·03(5분 스냅)
export const DAY_START_MIN = WIN_START
export const DAY_END_MIN = WIN_END
export const SNAP_MIN = 5 // 시작 시각은 5분 격자에 붙는다(CAL-TIME-03)

export interface DayBlock {
  kind: 'appt' | 'off'
  startMin: number
  endMin: number
  label: string // 예약=환자명, 휴진/점심=종류
  sub?: string // 예약 사유·상태
  offKind?: '휴진' | '점심시간'
}

/** 한 의사의 하루를 분 단위 블록으로(빈 시간은 블록이 없는 구간) */
export function buildBlocks(doctor: DoctorLite): DayBlock[] {
  const out: DayBlock[] = []
  calendarAppointments
    .filter((a) => a.doctorId === doctor.id)
    .forEach((a) => out.push({ kind: 'appt', startMin: toMin(a.start), endMin: toMin(a.end), label: a.patientName, sub: a.reason }))
  calendarOffHours
    .filter((o) => o.doctorId === doctor.id)
    .forEach((o) => out.push({ kind: 'off', startMin: toMin(o.start), endMin: toMin(o.end), label: o.kind, offKind: o.kind }))
  return out.sort((x, y) => x.startMin - y.startMin)
}

/** 5분 격자에 붙인다: 09:07 → 09:05 (CAL-TIME-03) */
export function snapMin(min: number): number {
  const snapped = Math.round(min / SNAP_MIN) * SNAP_MIN
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SNAP_MIN, snapped))
}

/** 그 시각에 진료시간만큼 잡으면 무엇과 겹치나 — 겹침 경고용(막지는 않음, CAL-GAP) */
export function overlapAt(doctor: DoctorLite, startMin: number): DayBlock | null {
  const endMin = startMin + doctor.slotMinutes
  for (const b of buildBlocks(doctor)) {
    if (startMin < b.endMin && endMin > b.startMin) return b
  }
  return null
}

export function minToHHMM(min: number): string {
  return toHHMM(min)
}

/** 오늘 날짜 라벨(데모 고정) */
export const TODAY_ISO = '2026-08-22'
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(iso).getDay()]
  return `${Number(m)}월 ${Number(d)}일 (${wd})`
}
