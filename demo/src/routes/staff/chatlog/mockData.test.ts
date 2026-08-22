import { describe, expect, it } from 'vitest'
import { CHAT_RECORDS, filterChatRecords } from './mockData'

describe('filterChatRecords', () => {
  it('채널과 상담 갈래를 함께 적용한다', () => {
    expect(filterChatRecords(CHAT_RECORDS, 'app', 'booking_support').map((record) => record.id)).toEqual(['C-2072'])
    expect(filterChatRecords(CHAT_RECORDS, 'app', 'staff_handoff')).toEqual([])
  })
})
