import { describe, it, expect } from 'vitest'
import { pickRepresentativeSupport } from './pickRepresentativeSupport'

// SUPPORT-CAL-DUP-01 — 한 예약에 상담 기록이 여럿일 때 ⚠ 대표 하나만 그린다.
//   대표 = 열린 티켓(pending|in_progress, idx_tickets_one_open으로 thread당 하나) → 없으면 가장 최근 answered.

describe('pickRepresentativeSupport', () => {
  it('[SUPPORT-CAL-DUP-01] 열린 티켓이 있으면 그것을 대표로 하고 상담 건수를 병기한다', () => {
    const rep = pickRepresentativeSupport([
      { ticketId: 'old', status: 'answered', createdAt: '2026-08-18T00:00:00Z' },
      { ticketId: 'open', status: 'in_progress', createdAt: '2026-08-19T00:00:00Z' },
    ])
    expect(rep).toEqual({ ticketId: 'open', status: 'in_progress', count: 2 })
  })

  it('[SUPPORT-CAL-DUP-01] 열린 티켓이 없으면 가장 최근 answered를 대표로 한다', () => {
    const rep = pickRepresentativeSupport([
      { ticketId: 'older', status: 'answered', createdAt: '2026-08-17T00:00:00Z' },
      { ticketId: 'newer', status: 'answered', createdAt: '2026-08-19T00:00:00Z' },
    ])
    expect(rep?.ticketId).toBe('newer') // 겹쳐 그리지 않고 최근 answered 하나
    expect(rep?.count).toBe(2)
  })

  it('[SUPPORT-CAL-DUP-01] 기록이 없으면 대표가 없다(null)', () => {
    expect(pickRepresentativeSupport([])).toBeNull()
  })
})
