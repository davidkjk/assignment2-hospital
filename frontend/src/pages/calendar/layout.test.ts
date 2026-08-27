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
