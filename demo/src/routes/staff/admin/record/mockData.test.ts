import { describe, expect, it } from 'vitest'

import { buildStatsCsv, csvProtectedValue } from './mockData'

describe('운영 통계 CSV 소수 집계 보호', () => {
  it('k=5 미만을 숫자로 내보내지 않는다', () => {
    expect(csvProtectedValue(4)).toBe('소수 인원 보호로 비공개')
    expect(csvProtectedValue(5)).toBe('5')
    expect(buildStatsCsv('2026-08-01', '2026-08-22')).not.toContain('"예약 부도 세부 분류","3"')
  })
})
