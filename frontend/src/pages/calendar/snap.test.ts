import { describe, expect, test } from 'vitest'
import { fitCount, nextEndAt, overlapWith, snapTo5min } from './snap'

// 이 파일의 시각은 전부 2026-08-17 하루 안에서만 비교하므로 날짜를 고정한다.
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 7, 17, h, m, 0, 0)
}

test('[CAL-TIME-03] 시작 시각은 5분 격자에 붙는다 — 의사별 진료시간 격자가 아니다', () => {
  // ⭐ 2026-08-06 사용자 지시로 뒤집힌 지점. 원래는 "5분은 표시 해상도이지 예약 가능 시각이 아니다"였다.
  //    창구의 현실이 격자대로 가지 않는다 — 앞 사람이 일찍 끝나기도, 급한 환자가 오기도 한다.
  expect(snapTo5min(at('09:07'))).toEqual(at('09:05'))
  expect(snapTo5min(at('10:03'))).toEqual(at('10:05'))
})

test('[CAL-TIME-09] slot_duration_minutes는 「길이」를 정하고 「시작할 수 있는 시각」은 정하지 않는다', () => {
  expect(nextEndAt(at('10:05'), 15)).toEqual(at('10:20'))
})

test('[CAL-TIME-04] 기본 단위는 빈자리를 셀 때 쓰는 자다', () => {
  // "이 의사의 진료시간으로 이 구간에 몇 명이 들어가나"를 재는 용도.
  expect(fitCount({ from: at('09:45'), to: at('10:30') }, 15)).toBe(3)
})

describe('[CAL-GAP-09] 겹침은 시작 시각이 아니라 시간 범위로 잰다', () => {
  // ⚠️ 슬롯 unique는 시작 시각만 보므로 10:05와 10:10이 둘 다 통과해 조용히 겹친다.
  const others = [
    { appointmentId: 'a1', startAt: at('10:20'), endAt: at('10:35'), patientLabel: '정우성 님' },
  ]

  test('범위가 겹치면 누구와 몇 분인지 돌려준다', () => {
    expect(overlapWith(at('10:15'), at('10:30'), others)).toEqual({
      appointmentId: 'a1',
      minutes: 10,
      patientLabel: '정우성 님',
    })
  })

  test('맞붙기만 하고 겹치지 않으면 null이다', () => {
    expect(overlapWith(at('10:00'), at('10:15'), others)).toBeNull()
  })
})
