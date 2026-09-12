import { act, renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { IDLE_TIMEOUT_MS, useIdleLogout } from './useIdleLogout'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('[SHELL-IDLE-01] 사람의 키 동작은 무활동 시간을 되돌린다', () => {
  const signOut = vi.fn()
  renderHook(() => useIdleLogout({ signOut }))
  act(() => vi.advanceTimersByTime(20 * 60_000))
  fireEvent.keyDown(document)
  act(() => vi.advanceTimersByTime(20 * 60_000))
  expect(signOut).not.toHaveBeenCalled()
})

test('[SHELL-IDLE-02] 27분에 만료 임박 상태가 된다', () => {
  const { result } = renderHook(() => useIdleLogout({ signOut: vi.fn() }))
  act(() => vi.advanceTimersByTime(27 * 60_000))
  expect(result.current.isWarning).toBe(true)
})

test('[SHELL-IDLE-04] 무활동 기준은 설정값이 아닌 30분 상수다', () => {
  expect(IDLE_TIMEOUT_MS).toBe(30 * 60_000)
})
