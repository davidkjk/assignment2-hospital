import {
  patients,
  departments,
  doctorsByDept,
  initialAppointments,
  getAvailableDates,
  getSlots,
} from './data'

test('본인이 환자 목록 맨 위(BOOK-WHO-01)', () => {
  expect(patients[0].relation).toBe('본인')
})

test('진료과별 의사 목록이 있다', () => {
  expect(doctorsByDept[departments[0].id].length).toBeGreaterThan(0)
})

test('초기 예약이 날짜·시각 오름차순', () => {
  const keys = initialAppointments.map((a) => `${a.date}T${a.time}`)
  expect([...keys].sort()).toEqual(keys)
})

test('예약 가능일은 8주(56일) 이내 평일 전부, 주말 제외 (BOOK-DATE-06)', () => {
  const from = new Date('2026-08-21T00:00:00')
  const dates = getAvailableDates('doc-im-1', from)
  // 8주 안에는 평일이 40일(8주 × 5). 첫날은 내일부터.
  expect(dates).toHaveLength(40)
  const horizon = new Date(from)
  horizon.setDate(horizon.getDate() + 56)
  for (const d of dates) {
    const dt = new Date(d + 'T00:00:00')
    expect(dt.getDay()).not.toBe(0)
    expect(dt.getDay()).not.toBe(6)
    expect(dt.getTime()).toBeGreaterThan(from.getTime())
    expect(dt.getTime()).toBeLessThanOrEqual(horizon.getTime())
  }
})

test('슬롯은 항상 최소 한 덩어리 이상', () => {
  const slots = getSlots('doc-im-1', '2026-08-24')
  expect(slots.length).toBeGreaterThan(0)
})
