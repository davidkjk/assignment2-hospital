import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useDirtyMap } from './useDirtyMap'
import type { WeekRow } from './types'

function row(weekday: number, max: number): WeekRow {
  return {
    weekday,
    is_day_off: false,
    start: '09:00',
    end: '18:00',
    slot_minutes: 15,
    lunch_start: '12:00',
    lunch_end: '13:00',
    max_daily: max,
    booking_deadline: '17:00',
  }
}

test('[SCHED-SAVE-02] 고친 (의사·요일)에 ●가 서고, 「고친 곳 N군데」는 그 의사의 고친 줄 수다', () => {
  const { result } = renderHook(() => useDirtyMap())
  act(() => {
    result.current.setDraft('doc1', 0, row(0, 50))
    result.current.setDraft('doc1', 2, row(2, 40))
  })
  expect(result.current.isDirty('doc1', 0)).toBe(true)
  expect(result.current.isDirty('doc1', 1)).toBe(false)
  expect(result.current.dirtyCount('doc1')).toBe(2)
})

test('[SCHED-SAVE-02b][갭 #106] 다른 의사로 옮겨도 앞 의사의 초안값이 덮이지 않고 남는다', () => {
  const { result } = renderHook(() => useDirtyMap())
  act(() => result.current.setDraft('park', 0, row(0, 50)))
  act(() => result.current.setDraft('kim', 0, row(0, 30)))
  // 박서연을 고쳐 놓고 김민수로 옮긴 뒤에도 박서연 초안은 살아 있다.
  expect(result.current.dirtyDoctors).toContain('park')
  expect(result.current.getDraft('park', 0)?.max_daily).toBe(50) // 덮이지 않았다
  expect(result.current.getDraft('kim', 0)?.max_daily).toBe(30)
})

test('[SCHED-SAVE-02c] ●가 붙을 의사 목록은 맵에서 파생된다 — 세로줄이 이걸 본다', () => {
  const { result } = renderHook(() => useDirtyMap())
  expect(result.current.dirtyDoctors).toEqual([])
  act(() => result.current.setDraft('doc1', 3, row(3, 20)))
  expect(result.current.dirtyDoctors).toEqual(['doc1'])
})

test('[SCHED-SAVE-08] 저장에 성공한 의사만 ●가 사라진다 — reset은 그 의사 초안만 지운다', () => {
  const { result } = renderHook(() => useDirtyMap())
  act(() => {
    result.current.setDraft('doc1', 0, row(0, 50))
    result.current.setDraft('doc2', 0, row(0, 60))
  })
  act(() => result.current.reset('doc1'))
  expect(result.current.isDirty('doc1', 0)).toBe(false)
  expect(result.current.dirtyDoctors).toEqual(['doc2']) // 남의 초안은 그대로
})
