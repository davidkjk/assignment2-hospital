// [CAL-SLOT-01·GAP-01] 한 의사·하루를 시각 좌표의 조각들로 나눈다 —
//   이어진 빈 구간을 한 덩어리 점선으로 묶고(30분마다 끊지 않는다), 지난 곳은 흐리게, 못 잡는 곳은 빗금.
//   ⭐ 세로축은 오직 시각이다(CAL-VIEW-01) — top·height가 시작·종료 시각이다.

import type { SlotDescriptor, SlotWarning } from './SlotBlock'
import type { GridAppointment, GridBlock } from './gridModel'

/** 짧은 틈은 범위 대신 길이로 적는다(CAL-SLOT-01) — 좁은 칸에 09:45–10:30이 안 들어간다. */
const SHORT_GAP_MINUTES = 15

function hhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export interface PositionedSlot {
  key: string
  doctorId: string
  startMin: number
  endMin: number
  top: number
  height: number
  descriptor: SlotDescriptor
  /** 예약 블록이면 클릭 시 상세로 보낼 id(CAL-SLOT-07). */
  appointmentId?: string
}

interface Occupied {
  startMin: number
  endMin: number
  descriptor: SlotDescriptor
  appointmentId?: string
}

export interface DayColumnParams {
  doctorId: string
  appointments: GridAppointment[]
  blocks: GridBlock[]
  windowStartMin: number
  windowEndMin: number
  pxPerMinute: number
  /** 오늘이면 현재 시각(자정 기준 분), 아니면 null. */
  nowMin?: number | null
  /** 어제 이전이면 빈 곳 전체가 「지난 시간」(CAL-PAST-01). */
  isPastDate?: boolean
  /** 예약별 경고(⚠ 확인 필요·겹침·상담) — 서버 판정을 화면이 옮기기만 한다. */
  warningsFor?: (appointmentId: string) => SlotWarning[] | undefined
}

function emptyLabel(startMin: number, endMin: number): string {
  const dur = endMin - startMin
  if (dur < SHORT_GAP_MINUTES) return `빈 시간 ${dur}분`
  return `빈 시간 ${hhmm(startMin)}–${hhmm(endMin)}`
}

function place(
  slot: Omit<PositionedSlot, 'top' | 'height'>,
  windowStartMin: number,
  pxPerMinute: number,
): PositionedSlot {
  return {
    ...slot,
    top: (slot.startMin - windowStartMin) * pxPerMinute,
    height: (slot.endMin - slot.startMin) * pxPerMinute,
  }
}

/** 빈 구간을 「지난 시간」·「빈 시간」으로 가른다(CAL-PAST-01·02). */
function splitEmpty(
  doctorId: string,
  startMin: number,
  endMin: number,
  params: DayColumnParams,
): Omit<PositionedSlot, 'top' | 'height'>[] {
  if (endMin <= startMin) return []
  const { nowMin, isPastDate } = params
  const out: Omit<PositionedSlot, 'top' | 'height'>[] = []

  const cut =
    isPastDate ? endMin : nowMin == null ? startMin : Math.min(Math.max(nowMin, startMin), endMin)

  if (cut > startMin) {
    out.push({
      key: `past-${doctorId}-${startMin}`,
      doctorId,
      startMin,
      endMin: cut,
      descriptor: { kind: 'past-empty', label: '지난 시간' },
    })
  }
  if (cut < endMin) {
    out.push({
      key: `empty-${doctorId}-${cut}`,
      doctorId,
      startMin: cut,
      endMin,
      descriptor: { kind: 'empty', label: emptyLabel(cut, endMin) },
    })
  }
  return out
}

/**
 * 한 의사의 하루를 시각 순서대로 조각낸다.
 *   ① 하루 전체 휴진(start/end 없음) → 창 전체가 한 덩어리 빗금.
 *   ② 예약·점심·부분 휴진을 시각 순으로 놓고, 사이를 빈 시간으로 채운다.
 */
export function buildDayColumn(params: DayColumnParams): PositionedSlot[] {
  const { doctorId, windowStartMin, windowEndMin, pxPerMinute } = params

  // ① 하루 전체 휴진.
  const wholeClosed = params.blocks.find((b) => b.kind === 'closed' && b.startMin == null)
  if (wholeClosed) {
    return [
      place(
        {
          key: `closed-${doctorId}`,
          doctorId,
          startMin: windowStartMin,
          endMin: windowEndMin,
          descriptor: { kind: 'hatched', label: `휴진 ${hhmm(windowStartMin)}–${hhmm(windowEndMin)}` },
        },
        windowStartMin,
        pxPerMinute,
      ),
    ]
  }

  // ② 점유 구간(예약 + 빗금)을 모아 시각 순으로.
  const occupied: Occupied[] = []
  for (const a of params.appointments) {
    occupied.push({
      startMin: a.startMin,
      endMin: a.endMin,
      appointmentId: a.appointmentId,
      descriptor: {
        kind: 'booked',
        patientLabel: a.patientLabel,
        statusLabel: a.statusLabel,
        paletteIndex: 0, // 열이 채운다(아래에서 doctor.paletteIndex로 덮어쓴다)
        warnings: params.warningsFor?.(a.appointmentId),
      },
    })
  }
  for (const b of params.blocks) {
    if (b.startMin == null || b.endMin == null) continue // 하루 전체 휴진은 위에서 처리됨
    const label = b.kind === 'lunch' ? '점심시간' : '휴진'
    occupied.push({
      startMin: b.startMin,
      endMin: b.endMin,
      descriptor: { kind: 'hatched', label: `${label} ${hhmm(b.startMin)}–${hhmm(b.endMin)}` },
    })
  }
  occupied.sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin)

  const raw: Omit<PositionedSlot, 'top' | 'height'>[] = []
  let cursor = windowStartMin
  let prevEnd = windowStartMin
  for (const occ of occupied) {
    const start = Math.max(occ.startMin, windowStartMin)
    const end = Math.min(occ.endMin, windowEndMin)
    if (start > cursor) {
      raw.push(...splitEmpty(doctorId, cursor, start, params))
    }
    // 쉬는 틈 없이 붙은 예약이면 흰 실선으로 가른다(CAL-COLOR-14).
    if (occ.descriptor.kind === 'booked' && start <= prevEnd && raw.length > 0) {
      occ.descriptor.backToBack = true
    }
    raw.push({
      key: occ.appointmentId
        ? `appt-${occ.appointmentId}`
        : `block-${doctorId}-${occ.startMin}`,
      doctorId,
      startMin: start,
      endMin: Math.max(end, start),
      descriptor: occ.descriptor,
      appointmentId: occ.appointmentId,
    })
    cursor = Math.max(cursor, end)
    prevEnd = cursor
  }
  if (cursor < windowEndMin) {
    raw.push(...splitEmpty(doctorId, cursor, windowEndMin, params))
  }

  return raw.map((s) => place(s, windowStartMin, pxPerMinute))
}
