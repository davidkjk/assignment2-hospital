import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { draftStatusText, useAutoSaveDraft } from './useAutoSaveDraft'
import { emptyFields } from './useDraftStore'

// [DOCTOR-RECORD-04·05] 자동 임시저장 — 멈춘 지 3초에 저장하되 직전 저장 후 30초는 미룬다.
//   실패해도 입력을 지우지 않고 [다시 시도]를 준다. 「임시저장」이라고만 말한다(완료로 오해 금지).

describe('useAutoSaveDraft', () => {
  afterEach(() => vi.useRealTimers())

  test('[DOCTOR-RECORD-04] 멈춘 지 3초에 저장하되, 직전 저장 후 30초가 안 지났으면 미룬다', () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(({ fields }) => useAutoSaveDraft({ fields, onSave }), {
      initialProps: { fields: emptyFields() },
    })

    act(() => rerender({ fields: { ...emptyFields(), symptoms: '기침' } }))
    act(() => void vi.advanceTimersByTime(3_000))
    expect(onSave).toHaveBeenCalledTimes(1) // 멈춘 지 3초

    act(() => rerender({ fields: { ...emptyFields(), symptoms: '기침 3일째' } }))
    act(() => void vi.advanceTimersByTime(3_000))
    expect(onSave).toHaveBeenCalledTimes(1) // 직전 저장 후 30초가 안 지났다

    act(() => void vi.advanceTimersByTime(27_000))
    expect(onSave).toHaveBeenCalledTimes(2) // 30초가 되어 그제야 저장
  })

  test('[DOCTOR-RECORD-04] 초기 마운트만으로는 저장하지 않는다', () => {
    vi.useFakeTimers()
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAutoSaveDraft({ fields: { ...emptyFields(), symptoms: '기존' }, onSave }))
    act(() => void vi.advanceTimersByTime(60_000))
    expect(onSave).not.toHaveBeenCalled() // 되살린 값을 저 혼자 다시 쓰지 않는다
  })

  test('[DOCTOR-RECORD-04] 저장 상태 문구는 「임시저장」이라고만 말한다', () => {
    expect(draftStatusText('saving', null)).toBe('임시저장 중…')
    expect(draftStatusText('saved', new Date('2026-08-15T14:32:00+09:00'))).toBe('임시저장됨 · 14:32')
    // 완료로 오해하게 두지 않는다
    expect(draftStatusText('saved', new Date('2026-08-15T14:32:00+09:00'))).not.toMatch(/진료 완료|저장 완료/)
    expect(draftStatusText('idle', null)).toBe('')
  })

  test('[DOCTOR-RECORD-05] 자동저장이 실패하면 오류를 남기고 [다시 시도]로 다시 보낸다', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('연결이 끊겨 저장할 수 없습니다'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() =>
      useAutoSaveDraft({ fields: { ...emptyFields(), symptoms: '기침 3일째' }, onSave }),
    )

    await act(async () => {
      await result.current.retry()
    })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('연결이 끊겨 저장할 수 없습니다') // 서버 문장 그대로

    await act(async () => {
      await result.current.retry()
    })
    await waitFor(() => expect(result.current.status).toBe('saved'))
    expect(onSave).toHaveBeenCalledTimes(2)
  })
})
