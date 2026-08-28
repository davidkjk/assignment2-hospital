// 세 문(등록·접수·예약) 공용 데이터·슬롯 계산 — 데모 `routes/staff/doors/doorData.ts` 포팅.
// 정본: `SHELL-DOOR-06`(세 문 패널 동작) · `PANEL-WORK-01/02`(패널=채우는 것 / 왼쪽=채우는 도구)
//       · `CAL-TIME-02/03`(길이 비례·5분 스냅) · `QUEUE-WALK-08b`(대기 인원).
//
// ✅ Wave 1 배선 완료 — 이 파일에 **가짜 데이터는 더 없다**(계산만 남았다):
//    · D2: 소프트 중복은 서버(`GET /patients/duplicate-check`)가 가린 값으로 답한다.
//    · D3: 환자 검색은 정본 부품 `pages/patients/PatientSearch`(mode="pick")가 한다(`MASK-SRV-01`).
//      접수 문의 의사 로스터·대기 인원은 `getTodaySummary().doctor_waiting`이 준다.
//    · D4: 예약 문의 의사 로스터·하루 일정·진료 길이는 `api/calendar.ts` `getCalendar`가 준다.
//      ⭐ 빗금(휴진·점심) 판정은 **서버 `resolve_day` 하나뿐**이다(`SCHED-EXC-12`) — 화면이
//        자기 계산을 가지면 같은 날이 캘린더에서는 진료중, 예약에서는 휴무가 된다.

import type { CalendarData } from '../../api/calendar'
import { hospitalInstant, hospitalMinutesOfDay, hospitalToday, hospitalWeekday, parseHospitalIso } from '../../lib/clock'
import { isoToMinutes, PALETTE_SIZE, statusLabel } from '../../pages/calendar/gridModel'
import type { SearchTodayStatus } from '../../api/patients'
import type { StartDoor } from '../navItems'

/** 문 = 헤더 세 버튼과 같은 이름을 쓴다(`START_DOORS`). 데모의 'reserve'가 실에선 'appointment'. */
export type DoorId = StartDoor
/** 지금 채우는 중인 패널의 칸 — 이것이 왼쪽 도구를 정한다(`PANEL-WORK-01`). */
export type FieldId = 'patient' | 'doctor' | 'date' | 'time' | 'find' | null

/** 문이 안고 다니는 환자 — **표시용 값만** 든다.
 *  ⭐ 생년월일·전화는 서버가 이미 가려서 준 문자열 그대로다(`MASK-SRV-01`) — 화면이 다시 가리지 않는다.
 *  방금 등록한 환자만 예외로 직원이 방금 친 값이 들어온다(자기가 친 값을 가릴 이유가 없다). */
export interface PatientLite {
  id: string
  name: string
  birthText: string
  phoneText: string
  /** 오늘 상태 — 검색 서버가 `/queue`와 같은 순간의 값으로 준다(`SEARCH-ACT-*`). */
  today?: { status: SearchTodayStatus; time: string | null }
}

export interface DoctorLite {
  id: string
  name: string
  department: string
  /** 오늘 대기 인원(`QUEUE-WALK-08b`) — 창구에서 「어느 선생님이 덜 기다리나」로 고른다.
   *  ⛔ 「다음 자리」는 아직 근거가 없어 적지 않는다(`QUEUE-WALK-08c` · 갭 #87). */
  waiting?: number
  /** [CAL-TIME-09] 그 날 요일의 진료 길이(분) — 서버 카탈로그가 준다. 그 요일에 규칙이 없으면
   *  없는 채로 온다: 지어내지 않고, 쓸 때만 기본 15분으로 그린다(`slotMinutesOf`). */
  slotMinutes?: number
  /** [CAL-COLOR-09] 색값이 아니라 팔레트의 몇 번째. 접수 문의 대기 인원 목록에는 없다. */
  paletteIndex?: number
}

/** [CAL-COLOR-12] 색은 `tokens.css`의 의사 팔레트에서만 온다 — 화면이 hex를 갖지 않는다. */
export function doctorFill(paletteIndex = 0): string {
  return `var(--doctor-palette-${paletteIndex % PALETTE_SIZE}-fill)`
}
export function doctorInk(paletteIndex = 0): string {
  return `var(--doctor-palette-${paletteIndex % PALETTE_SIZE})`
}

// ── 등록 문이 **직원이 방금 친 값**을 이어갈 때만 쓰는 가림 ────────────────────────
// ⚠️ `MASK-SRV-01`(서버가 가린 값으로만 준다)을 어기는 것이 아니다 — 여기 들어오는 전화·생년월일은
//    **서버에서 온 값이 아니라 직원이 방금 자기 손으로 친 값**이다(등록 폼). 그 값을 이음 카드에
//    원본 그대로 크게 띄우면 창구 화면이 어깨너머로 읽히므로, 화면 표시만 같은 모양으로 맞춘다.
// ⛔ 서버가 준 `masked_*`에는 절대 다시 쓰지 않는다.

/** 010-1234-5678 → 010-****-5678 (뒷자리 남김, `MASK-TEL-01`) */
export function maskTypedPhone(tel: string): string {
  return tel.replace(/^(\d{3})-?\d{3,4}-?(\d{4})$/, '$1-****-$2')
}
/** 1958-03-12 → 1958-**-12 (월만 가림, `MASK-DOB-01`) */
export function maskTypedBirth(d: string): string {
  return d.replace(/^(\d{4})-\d{2}-(\d{2})$/, '$1-**-$2')
}

// ── 오신 시각(`QUEUE-WALK-14~16`) ────────────────────────────────────────────

/** [QUEUE-WALK-14b·14c] 콜론을 안 쳐도 된다 — `1015`→10:15, 3자리 `905`→09:05.
 *  앞의 `0`을 치게 하면 한 손으로 치는 속도가 깨진다.
 *  ⛔ [QUEUE-WALK-14d] **5분 격자에 붙이지 않는다** — 예약은 「앞으로 만들 자리」라 붙여도 되지만
 *     방문 시각은 「실제로 일어난 일의 기록」이라 붙이는 순간 거짓이 된다(`CAL-TIME-03`과 정반대). */
export function parseVisitTime(raw: string): { hh: number; mm: number } | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 3 && digits.length !== 4) return null
  const hh = Number(digits.slice(0, digits.length - 2))
  const mm = Number(digits.slice(-2))
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null
  return { hh, mm }
}

/** 직원이 적은 「날짜 + 시각」을 실제 순간으로 옮긴다 — **병원 시각**으로 읽는다(`TIME-TZ-01`).
 *  ⛔ 브라우저 시간대로 읽으면 창구 PC가 한국이 아닐 때 **저장되는 순간 자체가 틀린다**. */
export function visitInstant(dateIso: string, hh: number, mm: number): Date {
  return hospitalInstant(dateIso, hh, mm)
}

// ── 의사 하루 일정(일간 캘린더 도구) ──
const WIN_START = 9 * 60 // 09:00
const WIN_END = 18 * 60 // 18:00

function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── 비례 캘린더용(분 단위) ── `CAL-TIME-02`(길이 비례)·`CAL-TIME-03`(5분 스냅)
export const DAY_START_MIN = WIN_START
export const DAY_END_MIN = WIN_END
export const SNAP_MIN = 5 // 시작 시각은 5분 격자에 붙는다(CAL-TIME-03)

export interface DayBlock {
  kind: 'appt' | 'off'
  startMin: number
  endMin: number
  label: string // 예약=환자명, 휴진/점심=종류
  sub?: string // 예약 상태 글자(`확정`·`신청 · 미확정`)
  offKind?: '휴진' | '점심시간'
}

/** 'HH:MM[:SS]' 시각 문자열 → 자정 기준 분. 빗금의 start/end가 이 꼴로 온다. */
function timeToMin(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** [CAL-SLOT-02·03·08·09] 서버가 준 하루를 그 의사의 블록으로 — 빈 시간은 블록이 없는 구간이다.
 *  ⭐ 판정하지 않는다. 서버 `resolve_day`가 이미 판정한 것을 좌표로 옮길 뿐이다(`SCHED-EXC-12`). */
export function blocksFor(data: CalendarData, doctorId: string, dateIso: string): DayBlock[] {
  const out: DayBlock[] = []

  for (const bar of data.appointments) {
    if (bar.doctor_id !== doctorId) continue
    const startMin = isoToMinutes(bar.start, dateIso)
    if (startMin == null) continue
    const endMin = bar.end != null ? isoToMinutes(bar.end, dateIso) : null
    out.push({
      kind: 'appt',
      startMin,
      endMin: endMin ?? startMin + SNAP_MIN,
      label: bar.name ?? '환자',
      sub: statusLabel(bar.status),
    })
  }

  for (const b of data.blocks) {
    if (b.doctor_id !== doctorId || b.date !== dateIso) continue
    // [CAL-SLOT-03] 휴진은 시각이 없다 — 그 날 전체를 한 덩어리로 덮는다.
    out.push({
      kind: 'off',
      startMin: b.start != null ? timeToMin(b.start) : DAY_START_MIN,
      endMin: b.end != null ? timeToMin(b.end) : DAY_END_MIN,
      label: b.kind === 'lunch' ? '점심시간' : '휴진',
      offKind: b.kind === 'lunch' ? '점심시간' : '휴진',
    })
  }

  return out.sort((x, y) => x.startMin - y.startMin)
}

/** 5분 격자에 붙인다: 09:07 → 09:05 (`CAL-TIME-03`) */
export function snapMin(min: number): number {
  const snapped = Math.round(min / SNAP_MIN) * SNAP_MIN
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SNAP_MIN, snapped))
}

/** 의사별 진료 길이(`CAL-TIME-09`). 서버가 그 요일 규칙을 못 찾았거나(카탈로그 null),
 *  접수 문처럼 대기 인원 조회로 고른 의사라 이 칸이 없으면 기본 15분으로 그린다. */
export function slotMinutesOf(d: DoctorLite): number {
  return d.slotMinutes ?? 15
}

function overlaps(startMin: number, endMin: number, b: DayBlock): boolean {
  // 맞붙기만 하는 경계(10:00–10:20 vs 10:20–)는 겹침이 아니다(`CAL-GAP-09`).
  return startMin < b.endMin && endMin > b.startMin
}

/** [CAL-SLOT-04·11] 그 자리가 **예약을 못 잡는 구간**인가 — 휴진·점심 빗금.
 *  ⭐ 겹침(`apptOverlapAt`)과 **동작이 다르다**: 이쪽은 경고가 아니라 막는 것이고,
 *     서버도 닫힌 시간을 400으로 거절한다. 미리 막지 않으면 저장 버튼이 막다른 길이 된다. */
export function closedAt(blocks: DayBlock[], startMin: number, slotMinutes: number): DayBlock | null {
  const endMin = startMin + slotMinutes
  for (const b of blocks) {
    if (b.kind === 'off' && overlaps(startMin, endMin, b)) return b
  }
  return null
}

/** [CAL-GAP-05·06·09] 그 자리가 다른 **예약**과 겹치나 — 경고를 읽고 `[그대로 잡기]`로 넘어갈 수 있다.
 *  겹침은 시작 시각이 아니라 시간 범위로 잰다(슬롯 unique는 시작만 보므로 조용히 겹친다). */
export function apptOverlapAt(blocks: DayBlock[], startMin: number, slotMinutes: number): DayBlock | null {
  const endMin = startMin + slotMinutes
  for (const b of blocks) {
    if (b.kind === 'appt' && overlaps(startMin, endMin, b)) return b
  }
  return null
}

/** [CAL-PAST-01] 그 날에서 「지난 시각」이 어디까지인가(자정 기준 분) — **병원 시계** 기준.
 *  다가올 날은 0(지난 것이 없다), 지나간 날은 하루 전체.
 *  ⭐ 날짜 비교는 문자열로 한다 — Date 자정을 만들면 로컬 자정과 병원 자정이 달라
 *     같은 병이 되돌아온다(ISO 날짜는 사전순 = 시간순이라 그냥 비교하면 된다). */
export function pastMinOn(dateIso: string, at: Date = new Date()): number {
  const today = hospitalToday(at)
  if (dateIso > today) return 0
  if (dateIso < today) return 24 * 60
  return hospitalMinutesOfDay(at)
}

export function minToHHMM(min: number): string {
  return toHHMM(min)
}

/** '2026-08-17' → '8월 17일 (월)'.
 *  ⚠️ 요일을 `new Date(iso).getDay()`로 읽으면 안 된다 — 그건 **UTC 자정**이라 서쪽
 *     시간대에서 하루 밀려 토요일이 금요일로 적힌다. 날짜 조각으로 센다. */
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const wd = ['일', '월', '화', '수', '목', '금', '토'][hospitalWeekday(iso)]
  return `${Number(m)}월 ${Number(d)}일 (${wd})`
}
