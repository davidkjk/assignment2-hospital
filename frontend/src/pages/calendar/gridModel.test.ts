import { expect, test } from 'vitest'
import { assignPalette, buildGridModel, PALETTE, statusLabel } from './gridModel'
import type { CalendarData, CalendarDoctorCatalog } from '../../api/calendar'

const DATE = '2026-08-17'

function catalog(overrides: Partial<CalendarDoctorCatalog>[]): CalendarDoctorCatalog[] {
  return overrides.map((o, i) => ({
    id: o.id ?? `d${i}`,
    name: o.name ?? `의사${i}`,
    department_name: o.department_name ?? '내과',
    palette_index: o.palette_index ?? null,
  }))
}

test('[CAL-COLOR-08][CAL-COLOR-11] 팔레트는 10색이다', () => {
  expect(PALETTE.length).toBe(10)
})

test('[CAL-COLOR-09] palette_index가 null이면 정렬 순서로 i % 10을 잠정 배정한다', () => {
  const map = assignPalette(catalog([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))
  expect(map.get('a')).toBe(0)
  expect(map.get('b')).toBe(1)
  expect(map.get('c')).toBe(2)
})

test('[CAL-COLOR-09] palette_index가 오면(Task 19) 그 값을 그대로 쓴다', () => {
  const map = assignPalette(catalog([{ id: 'a', palette_index: 3 }]))
  expect(map.get('a')).toBe(3)
})

test('[CAL-SLOT-02] 상태 코드를 사람이 읽는 글자로 옮기고 모르는 코드는 그대로 둔다', () => {
  expect(statusLabel('confirmed')).toBe('확정')
  expect(statusLabel('requested')).toBe('신청 · 미확정')
  expect(statusLabel('weird_new_status')).toBe('weird_new_status')
})

test('[CAL-COLOR-10] 예약이 없는 의사도 카탈로그에 있으면 격자 열이 생긴다', () => {
  const data: CalendarData = {
    appointments: [],
    blocks: [],
    affected_appointment_ids: [],
    doctors: catalog([{ id: 'd1', name: '박지훈' }]),
  }
  const model = buildGridModel(data, DATE)
  expect(model.doctors.map((d) => d.name)).toEqual(['박지훈'])
})

test('[CAL-TIME-09] end가 없는 막대는 slotMinutes로 종료를 채운다', () => {
  const data: CalendarData = {
    appointments: [
      {
        patient_id: 'p1',
        masked_name: '김*지',
        appointment_id: 'a1',
        doctor_id: 'd1',
        status: 'confirmed',
        start: `${DATE}T10:05:00`,
        end: null,
      },
    ],
    blocks: [],
    affected_appointment_ids: [],
    doctors: catalog([{ id: 'd1', name: '박지훈' }]),
  }
  const model = buildGridModel(data, DATE)
  const a1 = model.appointmentsByDoctor.get('d1')![0]
  expect(a1.startMin).toBe(10 * 60 + 5)
  expect(a1.endMin).toBe(10 * 60 + 20) // 기본 15분
})
