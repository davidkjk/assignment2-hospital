import { describe, expect, it } from 'vitest'
import { CHAT_RECORDS, filterChatRecords } from './mockData'

describe('filterChatRecords', () => {
  it('채널과 상담 갈래를 함께 적용한다', () => {
    const rows = filterChatRecords(CHAT_RECORDS, 'app', 'booking_support')
    // 결과가 있어야 하고, 모든 결과가 두 조건을 함께 만족해야 한다
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.channel === 'app' && r.routeTaken === 'booking_support')).toBe(true)
    // 다른 채널·갈래는 섞여 들어오지 않는다
    const webCount = filterChatRecords(CHAT_RECORDS, 'web', 'booking_support').length
    expect(rows.length + webCount).toBe(
      CHAT_RECORDS.filter((r) => r.routeTaken === 'booking_support').length,
    )
  })

  it("'전체'는 거르지 않는다", () => {
    expect(filterChatRecords(CHAT_RECORDS, 'all', 'all')).toHaveLength(CHAT_RECORDS.length)
  })
})
