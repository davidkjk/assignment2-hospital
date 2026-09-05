import { useCallback, useMemo, useState } from 'react'

// 여러 명 고르기의 상태 한 곳(`PICK-*`). 두 뜻을 절대 섞지 않는다:
//   ①「보이는 것만」(selected)  ②「검색 결과 전체」(allMatching, 안 보이는 것 포함).
// 문자는 건당 돈이 들고 되돌릴 수 없으므로(요구사항 4.7), 20명에게 보낸 줄 알고 120명에게
// 보내는 일이 없도록 이 둘을 갈라 센다. 전체를 켠 뒤 한 명을 빼면 통째로 풀리지 않고 excluded로만 뺀다.

export type HeaderState = 'none' | 'some' | 'all'

export function useSelection() {
  const [mode, setMode] = useState<'normal' | 'pick'>('normal')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const clear = useCallback(() => {
    setSelected(new Set())
    setExcluded(new Set())
    setAllMatching(false)
  }, [])

  const enterPick = useCallback(() => setMode('pick'), [])
  const exitPick = useCallback(() => {
    setMode('normal')
    clear()
  }, [clear])

  const isChecked = useCallback(
    (id: string) => (allMatching ? !excluded.has(id) : selected.has(id)),
    [allMatching, excluded, selected],
  )

  const toggle = useCallback(
    (id: string) => {
      if (allMatching) {
        setExcluded((prev) => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        })
      } else {
        setSelected((prev) => {
          const next = new Set(prev)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        })
      }
    },
    [allMatching],
  )

  /** 머리 체크칸 — 「보이는 것 전부」. 이미 다 골랐으면 (그 보이는 것들을) 지운다. */
  const toggleVisible = useCallback((visibleIds: string[]) => {
    setAllMatching(false)
    setExcluded(new Set())
    setSelected((prev) => {
      const allOn = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))
      return allOn ? new Set() : new Set(visibleIds)
    })
  }, [])

  /** 검색 결과 전체(안 보이는 것 포함)를 켠다 — 「보이는 것만」과 다른 뜻이다. */
  const selectAllMatching = useCallback(() => {
    setAllMatching(true)
    setExcluded(new Set())
  }, [])

  /** 경고 띠에서 「보이는 N명만」으로 되돌린다. */
  const selectVisibleOnly = useCallback((visibleIds: string[]) => {
    setAllMatching(false)
    setExcluded(new Set())
    setSelected(new Set(visibleIds))
  }, [])

  const count = useCallback(
    (matchTotal?: number) => {
      if (allMatching) return (matchTotal ?? 0) - excluded.size
      return selected.size
    },
    [allMatching, excluded, selected],
  )

  const headerState = useCallback(
    (visibleIds: string[]): HeaderState => {
      if (allMatching) return excluded.size === 0 ? 'all' : 'some'
      const on = visibleIds.filter((id) => selected.has(id)).length
      if (on === 0) return 'none'
      return on === visibleIds.length ? 'all' : 'some'
    },
    [allMatching, excluded, selected],
  )

  return useMemo(
    () => ({
      mode,
      allMatching,
      enterPick,
      exitPick,
      clear,
      isChecked,
      toggle,
      toggleVisible,
      selectAllMatching,
      selectVisibleOnly,
      count,
      headerState,
    }),
    [mode, allMatching, enterPick, exitPick, clear, isChecked, toggle, toggleVisible, selectAllMatching, selectVisibleOnly, count, headerState],
  )
}
