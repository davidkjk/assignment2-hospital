import { renderHook, act } from '@testing-library/react'
import { useBookingState } from './useBookingState'
import type { Doctor } from '@/mock/types'

const d1: Doctor = { id: 'a', deptId: 'd', name: '김', specialty: '', scheduleSummary: '' }
const d2: Doctor = { id: 'b', deptId: 'd', name: '이', specialty: '', scheduleSummary: '' }

test('의사를 바꾸면 날짜·시간이 초기화된다(BOOK-NAV-05)', () => {
  const { result } = renderHook(() => useBookingState())
  act(() => {
    result.current.setField('doctor', d1)
    result.current.setField('date', '2026-08-25')
    result.current.setField('time', '10:00')
  })
  expect(result.current.state.date).toBe('2026-08-25')

  act(() => {
    result.current.setField('doctor', d2)
  })
  expect(result.current.state.doctor).toBe(d2)
  expect(result.current.state.date).toBeUndefined()
  expect(result.current.state.time).toBeUndefined()
})

test('진행 표시 이름이 단계와 맞는다(BOOK-NAV-02)', () => {
  const { result } = renderHook(() => useBookingState())
  expect(result.current.state.step).toBe(1)
  expect(result.current.stepName).toBe('대상')
  act(() => result.current.next())
  expect(result.current.stepName).toBe('진료과')
})

test('back은 1단계 아래로 내려가지 않는다', () => {
  const { result } = renderHook(() => useBookingState())
  act(() => result.current.back())
  expect(result.current.state.step).toBe(1)
})

test('next는 8단계를 넘지 않는다', () => {
  const { result } = renderHook(() => useBookingState())
  act(() => {
    for (let i = 0; i < 20; i++) result.current.next()
  })
  expect(result.current.state.step).toBe(8)
})
