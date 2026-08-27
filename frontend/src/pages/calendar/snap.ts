// 캘린더 시각 계산 — ⭐ 화면과 서버가 같은 규칙을 써야 한다(CAL-TIME-03).
//   화면에서만 스냅하면 API를 직접 부르는 경로로 10:07이 들어오고, 격자에 눈금과 어긋난 블록이 그려진다.
//   서버가 5분 격자를 거절하는 테스트(test_appointment_time_range.py)가 이 파일과 서버를 묶는다.

const MS_PER_MINUTE = 60_000

/**
 * [CAL-TIME-03] 찍은 시각을 5분 격자에 붙인다 — 의사별 진료시간 격자가 아니다.
 * 반올림이라 09:07 → 09:05, 10:03 → 10:05. 시작 시각은 5분 단위 어디든이다.
 */
export function snapTo5min(clickedAt: Date): Date {
  const snapped = new Date(clickedAt)
  snapped.setSeconds(0, 0)
  const remainder = snapped.getMinutes() % 5
  const delta = remainder < 3 ? -remainder : 5 - remainder
  snapped.setMinutes(snapped.getMinutes() + delta)
  return snapped
}

/**
 * [CAL-TIME-09] slot_duration_minutes는 「길이」를 정한다 — 10:05에 15분이면 10:20이 끝.
 * 「시작할 수 있는 시각」은 정하지 않는다(그건 5분 단위 어디든이다).
 */
export function nextEndAt(startAt: Date, slotMinutes: number): Date {
  return new Date(startAt.getTime() + slotMinutes * MS_PER_MINUTE)
}

/**
 * [CAL-TIME-04] 빈자리를 셀 때 쓰는 자 — 이 구간에 진료시간이 몇 번 들어가나.
 */
export function fitCount(range: { from: Date; to: Date }, slotMinutes: number): number {
  const spanMinutes = (range.to.getTime() - range.from.getTime()) / MS_PER_MINUTE
  return Math.floor(spanMinutes / slotMinutes)
}

export interface CalendarBusy {
  appointmentId: string
  startAt: Date
  endAt: Date
  patientLabel: string
}

export interface Overlap {
  appointmentId: string
  minutes: number
  patientLabel: string
}

/**
 * [CAL-GAP-09] 겹침은 시작 시각이 아니라 시간 범위로 잰다.
 *   슬롯 unique는 시작 시각만 보므로 10:05와 10:10이 둘 다 통과해 조용히 겹친다.
 *   맞붙기만 하는 경계(10:00–10:15 vs 10:20–…)는 겹침이 아니다.
 * 첫 번째로 겹치는 예약과 겹친 분을 돌려준다. 겹침이 없으면 null.
 */
export function overlapWith(
  startAt: Date,
  endAt: Date,
  others: CalendarBusy[],
): Overlap | null {
  for (const other of others) {
    const overlapStart = Math.max(startAt.getTime(), other.startAt.getTime())
    const overlapEnd = Math.min(endAt.getTime(), other.endAt.getTime())
    if (overlapEnd > overlapStart) {
      return {
        appointmentId: other.appointmentId,
        minutes: (overlapEnd - overlapStart) / MS_PER_MINUTE,
        patientLabel: other.patientLabel,
      }
    }
  }
  return null
}
