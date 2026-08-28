import { describe, expect, test } from 'vitest'
import type { CalendarData } from '../../api/calendar'
import { blocksFor, closedAt, apptOverlapAt, fmtDate, pastMinOn, doctorFill, doctorInk } from './doorData'

// 예약 문(D4)의 순수 계산 — 화면이 좌표를 다루는 부분은 브라우저에서만 판정되므로(jsdom은
// getBoundingClientRect가 0이다) 「어느 시각이 어떤 자리인가」의 판정만 여기서 못박는다.
//
// ⭐ 판정은 셋이고 서로 다르다:
//   ① 지난 시각(CAL-PAST-01·02) — 오늘의 지금 이전. 아예 못 고른다.
//   ② 빗금(CAL-SLOT-04·11) — 휴진·점심. **예약을 못 잡는 구간**이고 서버도 400으로 거절한다.
//   ③ 겹침(CAL-GAP-05·06) — 다른 예약과 겹친다. 경고를 읽고 [그대로 잡기]로 넘어갈 수 있다.

const DATE = '2026-08-17' // 월요일

function data(over: Partial<CalendarData> = {}): CalendarData {
  return {
    appointments: [],
    blocks: [],
    affected_appointment_ids: [],
    booking_horizon_date: '2026-10-12',
    doctors: [{ id: 'd1', name: '이정훈', department_name: '내과', palette_index: null, slot_minutes: 20 }],
    ...over,
  }
}

describe('blocksFor — 서버 응답을 그 의사 그 날의 블록으로', () => {
  test('[CAL-SLOT-02] 예약 막대는 환자 이름과 상태 글자를 단 블록이 된다', () => {
    const blocks = blocksFor(
      data({
        appointments: [
          { patient_id: 'p1', name: '김민정', appointment_id: 'a1', doctor_id: 'd1', status: 'confirmed', start: `${DATE}T09:00:00`, end: `${DATE}T09:20:00` },
        ],
      }),
      'd1',
      DATE,
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'appt', startMin: 540, endMin: 560, label: '김민정', sub: '확정' })
  })

  test('[CAL-SLOT-09] 점심 빗금은 서버가 판정한 그 의사의 시각으로 그려진다', () => {
    const blocks = blocksFor(
      data({ blocks: [{ doctor_id: 'd1', date: DATE, kind: 'lunch', start: '12:30:00', end: '13:30:00', source: 'rule' }] }),
      'd1',
      DATE,
    )
    expect(blocks[0]).toMatchObject({ kind: 'off', offKind: '점심시간', startMin: 750, endMin: 810 })
  })

  test('[CAL-SLOT-03] 휴진은 시각이 없다 — 그 날 전체를 한 덩어리로 덮는다', () => {
    const blocks = blocksFor(
      data({ blocks: [{ doctor_id: 'd1', date: DATE, kind: 'closed', start: null, end: null, source: 'rule' }] }),
      'd1',
      DATE,
    )
    expect(blocks[0]).toMatchObject({ kind: 'off', offKind: '휴진', startMin: 540, endMin: 1080 })
  })

  test('다른 의사의 막대·빗금은 섞이지 않는다', () => {
    const blocks = blocksFor(
      data({
        appointments: [
          { patient_id: 'p1', name: '남의환자', appointment_id: 'a1', doctor_id: 'd2', status: 'confirmed', start: `${DATE}T09:00:00`, end: `${DATE}T09:20:00` },
        ],
        blocks: [{ doctor_id: 'd2', date: DATE, kind: 'lunch', start: '12:00:00', end: '13:00:00', source: 'rule' }],
      }),
      'd1',
      DATE,
    )
    expect(blocks).toEqual([])
  })
})

describe('closedAt — 빗금은 예약을 못 잡는 구간이다', () => {
  const blocks = blocksFor(
    data({ blocks: [{ doctor_id: 'd1', date: DATE, kind: 'lunch', start: '12:00:00', end: '13:00:00', source: 'rule' }] }),
    'd1',
    DATE,
  )

  test('[CAL-SLOT-04] 빗금에 걸치면 그 구간을 돌려준다 — 겹침(경고 후 진행)과 다른 판정이다', () => {
    expect(closedAt(blocks, 11 * 60 + 50, 20)?.offKind).toBe('점심시간')
  })

  test('[CAL-SLOT-11] 빗금에 닿지 않으면 null이다 — 맞붙기만 하는 경계는 걸침이 아니다', () => {
    expect(closedAt(blocks, 11 * 60 + 40, 20)).toBeNull()
    expect(closedAt(blocks, 13 * 60, 20)).toBeNull()
  })
})

describe('apptOverlapAt — 예약끼리의 겹침은 경고 뒤 진행할 수 있다', () => {
  const blocks = blocksFor(
    data({
      appointments: [
        { patient_id: 'p1', name: '정우성', appointment_id: 'a1', doctor_id: 'd1', status: 'confirmed', start: `${DATE}T10:20:00`, end: `${DATE}T10:40:00` },
      ],
    }),
    'd1',
    DATE,
  )

  test('[CAL-GAP-09] 겹침은 시작 시각이 아니라 시간 범위로 잰다', () => {
    // 10:05 + 20분 = 10:25 → 정우성(10:20~)과 5분 겹친다.
    expect(apptOverlapAt(blocks, 10 * 60 + 5, 20)).toMatchObject({ label: '정우성', startMin: 620 })
    // 10:00 + 20분 = 10:20 → 맞붙기만 하므로 겹침이 아니다.
    expect(apptOverlapAt(blocks, 10 * 60, 20)).toBeNull()
  })

  test('[CAL-SLOT-04] 빗금은 이 판정에 들지 않는다 — 둘은 동작이 다르다', () => {
    const withLunch = blocksFor(
      data({ blocks: [{ doctor_id: 'd1', date: DATE, kind: 'lunch', start: '12:00:00', end: '13:00:00', source: 'rule' }] }),
      'd1',
      DATE,
    )
    expect(apptOverlapAt(withLunch, 12 * 60, 20)).toBeNull()
  })
})

describe('pastMinOn — 지난 시각의 경계는 **병원 시계**로 잰다', () => {
  // ⭐ 기계 시계로 재면 창구 PC 시계가 틀어졌을 때 「지난 시간」이 통째로 어긋난다.
  //    아래 순간은 KST 2026-08-17 10:30(= UTC 2026-08-17 01:30)이다.
  const KST_1030 = new Date('2026-08-17T01:30:00Z')

  test('[CAL-PAST-01] 오늘이면 지금까지가 지난 시각이다', () => {
    expect(pastMinOn(DATE, KST_1030)).toBe(630)
  })

  test('[CAL-PAST-01] 다가올 날에는 지난 시각이 없다', () => {
    expect(pastMinOn('2026-08-18', KST_1030)).toBe(0)
  })

  test('[CAL-PAST-01] 지나간 날은 하루 전체가 지난 시각이다', () => {
    expect(pastMinOn('2026-08-16', KST_1030)).toBe(24 * 60)
  })

  test('[CAL-PAST-01] 한국이 자정을 넘긴 순간엔 기계의 「오늘」이 병원에겐 어제다', () => {
    // KST 8/29 01:20 — 기계(미 서부)는 아직 8/28이다.
    const past = new Date('2026-08-28T16:20:00Z')
    expect(pastMinOn('2026-08-29', past)).toBe(80)       // 병원의 오늘
    expect(pastMinOn('2026-08-28', past)).toBe(24 * 60)  // 병원에겐 지나간 날
  })
})

describe('fmtDate — 요일은 UTC 자정 파싱에 밀리지 않는다', () => {
  test('토요일을 금요일로 적지 않는다', () => {
    expect(fmtDate('2026-08-29')).toBe('8월 29일 (토)')
    expect(fmtDate('2026-08-31')).toBe('8월 31일 (월)')
  })
})

describe('의사 색 — 값이 아니라 팔레트의 몇 번째다(CAL-COLOR-09)', () => {
  test('[CAL-COLOR-12] 색은 토큰에서만 온다 — 화면이 hex를 갖지 않는다', () => {
    expect(doctorFill(3)).toBe('var(--doctor-palette-3-fill)')
    expect(doctorInk(3)).toBe('var(--doctor-palette-3)')
  })

  test('[CAL-COLOR-08] 팔레트는 10색이라 그 너머는 되돌아온다', () => {
    expect(doctorFill(12)).toBe('var(--doctor-palette-2-fill)')
  })
})
