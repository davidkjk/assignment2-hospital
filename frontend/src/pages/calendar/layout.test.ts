import { expect, test } from 'vitest'
import { buildDayColumn } from './layout'
import type { GridAppointment, GridBlock } from './gridModel'

const WINDOW = { windowStartMin: 9 * 60, windowEndMin: 12 * 60, pxPerMinute: 2 }

function appt(startMin: number, endMin: number, id = 'a1'): GridAppointment {
  return { appointmentId: id, doctorId: 'd1', patientLabel: '김민지', statusLabel: '확정', startMin, endMin }
}

test('[CAL-SLOT-01][CAL-GAP-01] 이어진 빈 구간을 한 덩어리로 묶고 짧으면 길이로 적는다', () => {
  const slots = buildDayColumn({
    doctorId: 'd1',
    appointments: [appt(10 * 60 + 30, 10 * 60 + 45)],
    blocks: [],
    ...WINDOW,
  })
  const labels = slots.map((s) => (s.descriptor.kind !== 'booked' ? s.descriptor.label : ''))
  expect(labels).toContain('빈 시간 09:00–10:30') // 90분을 30분마다 끊지 않는다
  expect(labels).toContain('빈 시간 10:45–12:00') // 꼬리 75분도 한 덩어리 범위
})

test('[CAL-SLOT-01] 15분 미만 틈은 「빈 시간 N분」으로 길이만 적는다', () => {
  const slots = buildDayColumn({
    doctorId: 'd1',
    appointments: [appt(9 * 60, 9 * 60 + 55), appt(10 * 60, 12 * 60, 'a2')],
    blocks: [],
    ...WINDOW,
  })
  const labels = slots.filter((s) => s.descriptor.kind === 'empty').map((s) => s.descriptor.kind === 'empty' && s.descriptor.label)
  expect(labels).toContain('빈 시간 5분') // 09:55–10:00
})

test('[CAL-VIEW-01][CAL-TIME-02] top·height가 시작·종료 시각이고 길이가 다르면 높이가 다르다', () => {
  const slots = buildDayColumn({
    doctorId: 'd1',
    appointments: [appt(9 * 60, 9 * 60 + 15, 'a15'), appt(10 * 60, 10 * 60 + 30, 'a30')],
    blocks: [],
    ...WINDOW,
  })
  const a15 = slots.find((s) => s.appointmentId === 'a15')!
  const a30 = slots.find((s) => s.appointmentId === 'a30')!
  expect(a15.top).toBe(0) // 09:00 = 창 시작
  expect(a15.height).toBeLessThan(a30.height) // 15분 < 30분
})

test('[CAL-SLOT-03][CAL-SLOT-08] 점심·부분 휴진은 빗금이고 글자만 다르다', () => {
  const blocks: GridBlock[] = [
    { doctorId: 'd1', kind: 'lunch', startMin: 12 * 60 - 30, endMin: 12 * 60 },
  ]
  const slots = buildDayColumn({ doctorId: 'd1', appointments: [], blocks, ...WINDOW })
  const lunch = slots.find((s) => s.descriptor.kind === 'hatched')!
  expect(lunch.descriptor.kind === 'hatched' && lunch.descriptor.label).toBe('점심시간 11:30–12:00')
})

test('[CAL-SLOT-03] 하루 전체 휴진은 창 전체가 한 덩어리 빗금이다', () => {
  const blocks: GridBlock[] = [{ doctorId: 'd1', kind: 'closed', startMin: null, endMin: null }]
  const slots = buildDayColumn({ doctorId: 'd1', appointments: [], blocks, ...WINDOW })
  expect(slots).toHaveLength(1)
  expect(slots[0].descriptor.kind === 'hatched' && slots[0].descriptor.label).toBe('휴진 09:00–12:00')
})

test('[CAL-SLOT-04·11][CAL-BOOK-04d] 진료시간 밖 봉투(한쪽만 열린 closed)는 창 끝까지 빗금이고, 진료 구간은 열려 있다', () => {
  // 09~13시만 보는 의사: 종료 뒤(13:00~창끝)는 못 잡는 빗금, 오전은 빈 시간(예약 가능).
  const WIN = { windowStartMin: 9 * 60, windowEndMin: 18 * 60, pxPerMinute: 2 }
  const blocks: GridBlock[] = [
    { doctorId: 'd1', kind: 'closed', startMin: null, endMin: 9 * 60 }, // 시작 전(창끝=시작이라 0폭)
    { doctorId: 'd1', kind: 'closed', startMin: 13 * 60, endMin: null }, // 종료 후 → 13:00~18:00
  ]
  const slots = buildDayColumn({ doctorId: 'd1', appointments: [], blocks, ...WIN })
  // 하루 전체 휴진 한 덩어리가 아니다 — 오전은 빈 시간으로 열려 있다.
  const empty = slots.find((s) => s.descriptor.kind === 'empty')
  expect(empty?.descriptor.kind === 'empty' && empty.descriptor.label).toBe('빈 시간 09:00–13:00')
  // 종료 후 봉투는 창 끝(18:00)까지 빗금이다.
  const hatched = slots.find((s) => s.descriptor.kind === 'hatched')!
  expect(hatched.descriptor.kind === 'hatched' && hatched.descriptor.label).toBe('휴진 13:00–18:00')
  expect(hatched.top).toBe((13 * 60 - 9 * 60) * 2) // 13:00에서 시작
})

test('[CAL-SLOT-04·11] 시작 전 봉투(창끝=종료가 진료 시작)도 그 구간만 빗금이다', () => {
  const WIN = { windowStartMin: 9 * 60, windowEndMin: 18 * 60, pxPerMinute: 2 }
  // 10시부터 보는 의사: 09:00~10:00이 못 잡는 빗금.
  const blocks: GridBlock[] = [{ doctorId: 'd1', kind: 'closed', startMin: null, endMin: 10 * 60 }]
  const slots = buildDayColumn({ doctorId: 'd1', appointments: [], blocks, ...WIN })
  const hatched = slots.find((s) => s.descriptor.kind === 'hatched')!
  expect(hatched.descriptor.kind === 'hatched' && hatched.descriptor.label).toBe('휴진 09:00–10:00')
})

test('[CAL-PAST-01][CAL-PAST-02] 오늘의 지난 빈 곳은 「지난 시간」으로 갈리고 이후는 「빈 시간」이다', () => {
  const slots = buildDayColumn({
    doctorId: 'd1',
    appointments: [],
    blocks: [],
    ...WINDOW,
    nowMin: 10 * 60, // 10:00 현재
  })
  const kinds = slots.map((s) => s.descriptor.kind)
  expect(kinds).toEqual(['past-empty', 'empty'])
  expect(slots[0].endMin).toBe(10 * 60) // 지난 구간은 현재까지
})

test('[CAL-PAST-01] 어제 이전 날짜는 빈 곳 전체가 「지난 시간」이다', () => {
  const slots = buildDayColumn({ doctorId: 'd1', appointments: [], blocks: [], ...WINDOW, isPastDate: true })
  expect(slots).toHaveLength(1)
  expect(slots[0].descriptor.kind).toBe('past-empty')
})

test('[CAL-COLOR-14] 쉬는 틈 없이 붙은 예약은 backToBack으로 표시된다', () => {
  const slots = buildDayColumn({
    doctorId: 'd1',
    appointments: [appt(9 * 60, 9 * 60 + 15, 'a1'), appt(9 * 60 + 15, 9 * 60 + 30, 'a2')],
    blocks: [],
    ...WINDOW,
  })
  const second = slots.find((s) => s.appointmentId === 'a2')!
  expect(second.descriptor.kind === 'booked' && second.descriptor.backToBack).toBe(true)
})

test('[CAL-SLOT-05] 영향 예약에 warningsFor가 「확인 필요」 배지를 얹는다', () => {
  const slots = buildDayColumn({
    doctorId: 'd1',
    appointments: [appt(9 * 60, 9 * 60 + 15, 'a1')],
    blocks: [],
    ...WINDOW,
    warningsFor: (id) => (id === 'a1' ? ['affected'] : undefined),
  })
  const a1 = slots.find((s) => s.appointmentId === 'a1')!
  expect(a1.descriptor.kind === 'booked' && a1.descriptor.warnings).toEqual(['affected'])
})
