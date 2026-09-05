import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { installMemoryStorage } from './testStorage'
import {
  clearAllDrafts,
  clearDraft,
  draftKey,
  emptyFields,
  readDraft,
  writeDraft,
} from './useDraftStore'

// [DOCTOR-DRAFT-01~03] 브라우저 초안 보관 — 글자마다 쓰고, 계정+예약 키로 가르고,
//   완료·로그아웃 즉시 전부 지운다. 규칙 ID 하나에 test 하나.

describe('useDraftStore', () => {
  beforeEach(() => {
    installMemoryStorage()
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  test('[DOCTOR-DRAFT-01] 글자가 바뀔 때마다 쓴 값을 그대로 되돌려준다', () => {
    writeDraft('staff-77', 'appt-1234', { ...emptyFields(), symptoms: '기' })
    expect(readDraft('staff-77', 'appt-1234')?.fields.symptoms).toBe('기')
    writeDraft('staff-77', 'appt-1234', { ...emptyFields(), symptoms: '기침' })
    expect(readDraft('staff-77', 'appt-1234')?.fields.symptoms).toBe('기침')
  })

  test('[DOCTOR-DRAFT-02] 키에 계정 id가 들어가 남의 초안이 뜨지 않는다', () => {
    writeDraft('staff-77', 'appt-1234', { ...emptyFields(), symptoms: '기침 3일째' })
    expect(draftKey('staff-77', 'appt-1234')).toBe('draft:staff-77:appt-1234')
    expect(readDraft('staff-99', 'appt-1234')).toBeNull() // 다른 계정에겐 없는 것으로
  })

  test('[DOCTOR-DRAFT-03] clearAllDrafts는 draft: 키를 전부 지운다', () => {
    localStorage.setItem('unrelated', 'keep-me')
    writeDraft('staff-77', 'appt-1', { ...emptyFields(), symptoms: 'a' })
    writeDraft('staff-77', 'appt-2', { ...emptyFields(), symptoms: 'b' })
    clearAllDrafts()
    expect(readDraft('staff-77', 'appt-1')).toBeNull()
    expect(readDraft('staff-77', 'appt-2')).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep-me') // 남의 저장소는 안 건드린다
  })

  test('[DOCTOR-DRAFT-03] clearDraft는 그 예약 하나만 지운다', () => {
    writeDraft('staff-77', 'appt-1', { ...emptyFields(), symptoms: 'a' })
    writeDraft('staff-77', 'appt-2', { ...emptyFields(), symptoms: 'b' })
    clearDraft('staff-77', 'appt-1')
    expect(readDraft('staff-77', 'appt-1')).toBeNull()
    expect(readDraft('staff-77', 'appt-2')?.fields.symptoms).toBe('b')
  })

  test('[DOCTOR-DRAFT-04] 저장 시각을 함께 남겨 복구 때 최신 비교에 쓴다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T14:31:00+09:00'))
    writeDraft('staff-77', 'appt-1', { ...emptyFields(), symptoms: 'a' })
    expect(readDraft('staff-77', 'appt-1')?.savedAt).toBe(new Date('2026-08-15T14:31:00+09:00').toISOString())
  })
})
