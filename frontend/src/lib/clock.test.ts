import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  addDaysIso, formatHospitalDate, hospitalHHMM, hospitalMinutesOfDay,
  hospitalInstant, hospitalParts, parseHospitalIso, hospitalToday, hospitalWeekday, isHospitalToday,
} from './clock'

// ⭐ 이 파일의 핵심 계약: **이 코드가 도는 기계의 시간대가 무엇이든 답이 같다.**
//    서버가 `Asia/Seoul`로 못박혀 있으므로(backend/app/db/pool.py:29) 화면도 같은 시계를 봐야
//    한 화면 안에서 날짜가 갈리지 않는다.

afterEach(() => vi.useRealTimers())

/** 2026-08-29 01:20 KST = 2026-08-28 16:20 UTC — 한국은 이미 다음 날인 순간. */
const KST_PAST_MIDNIGHT = new Date('2026-08-28T16:20:00Z')

describe('병원의 오늘 — 기계 시계가 아니라 병원 시계다', () => {
  test('한국이 자정을 넘긴 순간, 기계가 아직 어제여도 오늘은 8월 29일이다', () => {
    expect(hospitalToday(KST_PAST_MIDNIGHT)).toBe('2026-08-29')
  })

  test('지금 몇 시인가도 병원 시계로 답한다', () => {
    expect(hospitalHHMM(KST_PAST_MIDNIGHT)).toBe('01:20')
    expect(hospitalMinutesOfDay(KST_PAST_MIDNIGHT)).toBe(80)
  })

  test('자정 정각은 24시가 아니라 00시다', () => {
    // KST 2026-08-29 00:00 = UTC 2026-08-28 15:00. Intl이 '24'를 주는 경계를 막는다.
    expect(hospitalHHMM(new Date('2026-08-28T15:00:00Z'))).toBe('00:00')
    expect(hospitalMinutesOfDay(new Date('2026-08-28T15:00:00Z'))).toBe(0)
  })

  test('조각으로도 같은 답을 준다', () => {
    expect(hospitalParts(KST_PAST_MIDNIGHT)).toEqual({ y: '2026', mo: '08', d: '29', hh: '01', mm: '20' })
  })
})

describe('오늘인가 — 문자열로 비교한다(Date 자정을 만들지 않는다)', () => {
  test('병원 기준 오늘이면 참', () => {
    expect(isHospitalToday('2026-08-29', KST_PAST_MIDNIGHT)).toBe(true)
  })

  test('기계 기준 오늘(8/28)은 병원에겐 어제다', () => {
    expect(isHospitalToday('2026-08-28', KST_PAST_MIDNIGHT)).toBe(false)
  })
})

describe('날짜 문자열 셈 — 시간대에 흔들리지 않는다', () => {
  test('요일은 로컬 파싱이 아니라 날짜 조각으로 읽는다', () => {
    // new Date('2026-08-29')는 UTC 자정이라 미 서부에서 하루 밀린다. 그 함정을 막는다.
    expect(hospitalWeekday('2026-08-29')).toBe(6) // 토
    expect(hospitalWeekday('2026-08-31')).toBe(1) // 월
  })

  test('며칠 뒤·앞은 달·해를 넘겨도 맞는다', () => {
    expect(addDaysIso('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })

  test('사람이 읽는 날짜로 옮긴다', () => {
    expect(formatHospitalDate('2026-08-29')).toBe('2026년 8월 29일 (토)')
  })
})

describe('인자를 안 주면 진짜 지금을 쓴다', () => {
  test('기본값은 현재 시각이다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(KST_PAST_MIDNIGHT)
    expect(hospitalToday()).toBe('2026-08-29')
    expect(hospitalHHMM()).toBe('01:20')
  })
})

describe('hospitalInstant — 직원이 친 시각을 실제 순간으로', () => {
  test('그 PC의 시간대가 아니라 병원 시각으로 해석한다', () => {
    // 병원 8/29 09:05 = UTC 8/29 00:05. 기계가 어디에 있든 같은 순간이어야 한다.
    expect(hospitalInstant('2026-08-29', 9, 5).toISOString()).toBe('2026-08-29T00:05:00.000Z')
  })

  test('되돌려 읽으면 친 그대로다', () => {
    const at = hospitalInstant('2026-08-29', 9, 5)
    expect(hospitalParts(at)).toMatchObject({ y: '2026', mo: '08', d: '29', hh: '09', mm: '05' })
  })

  test('자정 넘김도 어긋나지 않는다', () => {
    expect(hospitalInstant('2026-08-29', 0, 30).toISOString()).toBe('2026-08-28T15:30:00.000Z')
  })
})

describe('parseHospitalIso — 서버가 주는 두 꼴을 모두 병원 시각으로 읽는다', () => {
  test('오프셋 없는 시각은 **병원 벽시계**다 — 그 PC 시간대로 읽지 않는다', () => {
    expect(parseHospitalIso('2026-08-29T09:00:00').toISOString()).toBe('2026-08-29T00:00:00.000Z')
  })

  test('오프셋이 붙어 있으면 이미 절대 순간이라 그대로 쓴다', () => {
    expect(parseHospitalIso('2026-08-29T00:00:00+00:00').toISOString()).toBe('2026-08-29T00:00:00.000Z')
    expect(parseHospitalIso('2026-08-29T00:00:00Z').toISOString()).toBe('2026-08-29T00:00:00.000Z')
  })

  test('읽은 뒤 병원 조각으로 되돌리면 서버가 적어 보낸 그대로다', () => {
    expect(hospitalParts(parseHospitalIso('2026-08-29T14:30:00'))).toMatchObject({ d: '29', hh: '14', mm: '30' })
  })
})
