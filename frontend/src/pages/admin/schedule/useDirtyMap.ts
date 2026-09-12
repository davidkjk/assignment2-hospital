import { useCallback, useMemo, useState } from 'react'
import type { WeekRow } from './types'

// [갭 #106] 의사별로 나뉜 미저장 상태. ⭐⭐ 이건 상태 구조의 문제라 화면을 다 그린 뒤엔 못 고친다.
//   상태는 처음부터 Map<doctorId, Map<weekday, row>>여야 하고, ●는 이 맵에서 파생된다 —
//   세 층(줄·의사·세로줄)이 같은 근거를 보므로 서로 어긋날 수 없다(SCHED-SAVE-02·02b·02c).
// ⚠️ SCHED-SAVE-07(묻지 않고 날린다)과 SCHED-SAVE-02b(의사 이름 옆 ●)는 한 쌍이다 — 묻지 않기로
//    한 이상 「떠나기 전에 보이는 것」이 유일한 방어다. 그래서 이 맵은 화면을 안 떠나는 한 초안을 지운다.

export interface DirtyMapApi {
  /** 이 의사·이 요일에 저장 안 한 값이 있나(SCHED-SAVE-02). */
  isDirty(doctorId: string, weekday: number): boolean
  /** 초안값(저장 안 한 편집). 없으면 undefined — 화면은 서버값으로 되돌아간다. */
  getDraft(doctorId: string, weekday: number): WeekRow | undefined
  /** 한 칸을 고칠 때마다 그 (의사, 요일) 줄을 통째로 초안에 담는다. */
  setDraft(doctorId: string, weekday: number, row: WeekRow): void
  /** 이 의사의 고친 요일들(오름차순). */
  dirtyWeekdays(doctorId: string): number[]
  /** 이 의사의 「고친 곳 N군데」(SCHED-SAVE-02). */
  dirtyCount(doctorId: string): number
  /** ● 이 붙어야 할 의사들 — 위쪽 가로줄·세로줄이 이걸 본다(SCHED-SAVE-02b·02c). */
  dirtyDoctors: string[]
  /** 저장에 성공한 의사의 초안을 지운다 — ●가 사라진다(SCHED-SAVE-08). */
  reset(doctorId: string): void
}

type DraftState = Record<string, Record<number, WeekRow>>

export function useDirtyMap(): DirtyMapApi {
  const [drafts, setDrafts] = useState<DraftState>({})

  const setDraft = useCallback((doctorId: string, weekday: number, row: WeekRow) => {
    setDrafts((prev) => ({
      ...prev,
      [doctorId]: { ...(prev[doctorId] ?? {}), [weekday]: row },
    }))
  }, [])

  const reset = useCallback((doctorId: string) => {
    setDrafts((prev) => {
      if (!prev[doctorId]) return prev
      const next = { ...prev }
      delete next[doctorId]
      return next
    })
  }, [])

  const isDirty = useCallback(
    (doctorId: string, weekday: number) => drafts[doctorId]?.[weekday] !== undefined,
    [drafts],
  )

  const getDraft = useCallback(
    (doctorId: string, weekday: number) => drafts[doctorId]?.[weekday],
    [drafts],
  )

  const dirtyWeekdays = useCallback(
    (doctorId: string) =>
      Object.keys(drafts[doctorId] ?? {})
        .map(Number)
        .sort((a, b) => a - b),
    [drafts],
  )

  const dirtyCount = useCallback(
    (doctorId: string) => Object.keys(drafts[doctorId] ?? {}).length,
    [drafts],
  )

  const dirtyDoctors = useMemo(
    () => Object.keys(drafts).filter((id) => Object.keys(drafts[id]).length > 0),
    [drafts],
  )

  return { isDirty, getDraft, setDraft, dirtyWeekdays, dirtyCount, dirtyDoctors, reset }
}
