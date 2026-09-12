import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'
import { DEFAULT_HOUR_HEIGHT, MAX_HOUR_HEIGHT, MIN_HOUR_HEIGHT, useZoom } from './useZoom'

// 저장 격리 — jsdom localStorage가 실행 간 파일에 남을 수 있어 테스트마다 새 직원 키를 쓴다.
let seq = 0
const KEY = () => `staff-${Date.now()}-${seq++}`

test('[CAL-ZOOM-01] 처음에는 기본 배율로 열린다', () => {
  const k = KEY()
  const { result } = renderHook(() => useZoom(k))
  expect(result.current.hourHeight).toBe(DEFAULT_HOUR_HEIGHT)
})

test('[CAL-ZOOM-01] 끄는 만큼 1시간 높이가 커진다', () => {
  const k = KEY()
  const { result } = renderHook(() => useZoom(k))
  act(() => result.current.dragBy(30))
  expect(result.current.hourHeight).toBe(DEFAULT_HOUR_HEIGHT + 30)
})

test('[CAL-ZOOM-03] 아무리 크게 끌어도 240px를 넘지 않는다', () => {
  const k = KEY()
  const { result } = renderHook(() => useZoom(k))
  act(() => result.current.dragBy(9999))
  expect(result.current.hourHeight).toBe(MAX_HOUR_HEIGHT)
})

test('[CAL-ZOOM-03] 아무리 작게 끌어도 30px 밑으로 내려가지 않는다', () => {
  const k = KEY()
  const { result } = renderHook(() => useZoom(k))
  act(() => result.current.dragBy(-9999))
  expect(result.current.hourHeight).toBe(MIN_HOUR_HEIGHT)
})

test('[CAL-ZOOM-06] [기본 배율]로 되돌릴 수 있다', () => {
  const k = KEY()
  const { result } = renderHook(() => useZoom(k))
  act(() => result.current.dragBy(60))
  act(() => result.current.reset())
  expect(result.current.hourHeight).toBe(DEFAULT_HOUR_HEIGHT)
})

test('[CAL-ZOOM-05] 배율은 그 직원에게 기억되어 다시 열어도 그대로다', () => {
  const k = KEY()
  const first = renderHook(() => useZoom(k))
  act(() => first.result.current.dragBy(30))
  first.unmount()
  const second = renderHook(() => useZoom(k))
  expect(second.result.current.hourHeight).toBe(DEFAULT_HOUR_HEIGHT + 30)
})

test('[CAL-ZOOM-05] 배율은 사람마다 따로 기억된다', () => {
  const mine = renderHook(() => useZoom(KEY()))
  act(() => mine.result.current.dragBy(60))
  const other = renderHook(() => useZoom(KEY()))
  expect(other.result.current.hourHeight).toBe(DEFAULT_HOUR_HEIGHT)
})
