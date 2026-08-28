// 캘린더 격자 도메인 — 백엔드 응답(CalendarData)을 격자가 그릴 모양으로 정규화한다.
//   ⭐ 화면이 자기 판정을 갖지 않는다(SCHED-EXC-12) — 빗금·영향예약은 서버가 준 값을 그대로 옮긴다.
//   여기서 하는 일은 ①ISO 시각 → 자정 기준 분 ②팔레트 인덱스 잠정 배정 ③상태 → 사람이 읽는 라벨뿐이다.

import type {
  CalendarBar,
  CalendarBlock,
  CalendarData,
  CalendarDoctorCatalog,
} from '../../api/calendar'
import { hospitalMinutesOfDay, hospitalParts, parseHospitalIso } from '../../lib/clock'

// [CAL-COLOR-08][CAL-COLOR-11] 팔레트는 10색이다(tokens.css --doctor-palette-0..9).
export const PALETTE_SIZE = 10
export const PALETTE = Array.from({ length: PALETTE_SIZE }, (_, i) => i)

/** 격자에 열이 생기는 의사 한 명(CAL-VIEW/NAME/COLOR). */
export interface GridDoctor {
  id: string
  name: string
  departmentName: string | null
  /** [CAL-COLOR-09] 색값이 아니라 팔레트의 몇 번째. */
  paletteIndex: number
  /** [CAL-NAME-02][CAL-TIME-09] 「N분」 표기·스냅 미리보기에 쓰는 진료 길이.
   *  서버 카탈로그의 slot_minutes가 먼저고, 없으면 예약 길이에서 도출, 그것도 없으면 15분. */
  slotMinutes: number
}

/** 격자에 그릴 예약 막대 — 시각은 자정 기준 분으로 갖는다(격자 좌표 계산에 곧바로 쓰인다). */
export interface GridAppointment {
  appointmentId: string
  doctorId: string
  patientLabel: string
  statusLabel: string
  startMin: number
  endMin: number
}

/** 빗금 구간 — 점심·휴진(CAL-SLOT-03·08). 휴진은 하루 전체라 start/end가 없다. */
export interface GridBlock {
  doctorId: string
  kind: 'closed' | 'lunch'
  startMin: number | null
  endMin: number | null
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: '확정',
  reserved: '확정',
  booked: '확정',
  arrived: '확정',
  in_progress: '확정',
  requested: '신청 · 미확정',
  pending: '신청 · 미확정',
}

/** [CAL-SLOT-02] 상태 코드를 사람이 읽는 글자로 — 모르는 코드는 그대로 보여 사라지지 않게 한다. */
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

/** ISO 시각을 그 날 자정 기준 분으로. 날짜가 다르면(막대가 다른 날) null. */
export function isoToMinutes(iso: string, onDate: string): number | null {
  // ⭐ 서버가 준 순간을 **병원 달력·시계**로 읽는다(`TIME-TZ-01`) — 그 PC 시계로 읽으면
  //    막대가 엉뚱한 높이에 그려지고, 시간대에 따라 「그 날이 아니다」며 통째로 사라진다.
  const p = hospitalParts(parseHospitalIso(iso))
  if (`${p.y}-${p.mo}-${p.d}` !== onDate) return null
  return Number(p.hh) * 60 + Number(p.mm)
}

/** HH:MM 문자열이나 ISO에서 자정 기준 분. blocks의 start/end는 'HH:MM:SS' 시각 문자열로 온다. */
function timeToMinutes(value: string): number {
  // 'HH:MM[:SS]' 또는 ISO — 앞의 시:분만 읽는다.
  const iso = value.includes('T') ? parseHospitalIso(value) : null
  if (iso && !Number.isNaN(iso.getTime())) return hospitalMinutesOfDay(iso)
  const [h, mm] = value.split(':').map(Number)
  return h * 60 + (mm || 0)
}

/**
 * [CAL-COLOR-01·02·09] 팔레트 인덱스 잠정 배정.
 *   palette_index가 오면 그대로, 없으면(지금 항상 null · 갭 #83) 정렬 순서로 i % 10.
 *   Task 19가 실제 인덱스를 채우면 계약 그대로 대체된다.
 */
export function assignPalette(catalog: CalendarDoctorCatalog[]): Map<string, number> {
  const map = new Map<string, number>()
  catalog.forEach((doc, i) => {
    map.set(doc.id, doc.palette_index ?? i % PALETTE_SIZE)
  })
  return map
}

/** 예약 막대들에서 의사별 진료 길이를 도출(카탈로그에 slotMinutes가 없다) — 첫 막대 길이, 없으면 15분. */
function deriveSlotMinutes(appointments: GridAppointment[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of appointments) {
    if (!map.has(a.doctorId)) {
      const len = a.endMin - a.startMin
      if (len > 0) map.set(a.doctorId, len)
    }
  }
  return map
}

/** 백엔드 예약 막대 한 줄을 격자 좌표로. end가 없으면 slotMinutes로 채운다(CAL-TIME-09). */
export function normalizeBar(
  bar: CalendarBar,
  onDate: string,
  fallbackSlotMinutes = 15,
): GridAppointment | null {
  const startMin = isoToMinutes(bar.start, onDate)
  if (startMin == null) return null
  const endMin = bar.end != null ? isoToMinutes(bar.end, onDate) : null
  return {
    appointmentId: bar.appointment_id,
    doctorId: bar.doctor_id,
    patientLabel: bar.name ?? '환자',
    statusLabel: statusLabel(bar.status),
    startMin,
    endMin: endMin ?? startMin + fallbackSlotMinutes,
  }
}

export function normalizeBlock(block: CalendarBlock): GridBlock {
  return {
    doctorId: block.doctor_id,
    kind: block.kind,
    startMin: block.start != null ? timeToMinutes(block.start) : null,
    endMin: block.end != null ? timeToMinutes(block.end) : null,
  }
}

export interface GridModel {
  doctors: GridDoctor[]
  appointmentsByDoctor: Map<string, GridAppointment[]>
  blocksByDoctor: Map<string, GridBlock[]>
}

/** 하루치 응답을 격자 모델로 조립한다(CalendarPage가 부른다). */
export function buildGridModel(data: CalendarData, onDate: string): GridModel {
  const palette = assignPalette(data.doctors)
  const appointments = data.appointments
    .map((b) => normalizeBar(b, onDate))
    .filter((a): a is GridAppointment => a != null)
  const slotByDoctor = deriveSlotMinutes(appointments)

  const doctors: GridDoctor[] = data.doctors.map((doc) => ({
    id: doc.id,
    name: doc.name,
    departmentName: doc.department_name,
    paletteIndex: palette.get(doc.id) ?? 0,
    // [CAL-TIME-09] 서버가 준 근거가 먼저다 — 도출은 그 요일 규칙이 없을 때의 차선책.
    slotMinutes: doc.slot_minutes ?? slotByDoctor.get(doc.id) ?? 15,
  }))

  const appointmentsByDoctor = new Map<string, GridAppointment[]>()
  for (const a of appointments) {
    const list = appointmentsByDoctor.get(a.doctorId) ?? []
    list.push(a)
    appointmentsByDoctor.set(a.doctorId, list)
  }

  const blocksByDoctor = new Map<string, GridBlock[]>()
  for (const b of data.blocks) {
    const nb = normalizeBlock(b)
    const list = blocksByDoctor.get(nb.doctorId) ?? []
    list.push(nb)
    blocksByDoctor.set(nb.doctorId, list)
  }

  return { doctors, appointmentsByDoctor, blocksByDoctor }
}
