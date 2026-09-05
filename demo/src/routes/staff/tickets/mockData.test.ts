import { describe, expect, it } from 'vitest'
import { INITIAL_TICKETS, ticketsForStatus } from './mockData'

describe('ticketsForStatus', () => {
  it('선택한 상태만 오래된 접수순으로 정렬한다', () => {
    const pending = ticketsForStatus(INITIAL_TICKETS, 'pending')
    expect(pending.map((ticket) => ticket.id)).toEqual(['T-1042', 'T-1045'])
    expect(pending.every((ticket) => ticket.status === 'pending')).toBe(true)
  })
})
