import { useCallback, useRef, useState } from 'react'
import { searchPatients, type SearchPatientRow } from '../../api/patients'

// ⭐ 자동검색·경합·이어받기를 한곳에 모은 훅(SEARCH-RUN-*·RESULT-03~06). 화면(PatientSearch)은
//    이 훅이 내주는 상태만 그린다 — 언제 나가는지(0.4초/Enter)와 늦게 온 것을 버리는 판단이 여기 있다.
//
// 두 가지 경합을 함께 막는다:
//   ① RUN-05 — 늦게 도착한 지난 검색을 버린다(reqSeq). 김을 친 뒤 김 1234로 좁혔는데 느린 김이
//      나중에 도착해 213명으로 덮는 사고를 막는다.
//   ② RUN-04 — 새로 찾는 동안 이미 뜬 목록을 지우지 않는다. 도착해서야 갈아끼운다(화면이 안 깜빡인다).

const DEBOUNCE_MS = 400

export interface SearchState {
  query: string
  rows: SearchPatientRow[]
  hasMore: boolean
  /** 한 번이라도 검색이 끝났나 — 0건 안내를 「검색 전」과 가르는 신호. */
  hasSearched: boolean
  /** 새 검색(첫 페이지)이 진행 중 — 건수 옆 「찾는 중」 표시(RUN-04). */
  searching: boolean
  loadingMore: boolean
  loadMoreFailed: boolean
  onChange: (q: string) => void
  onEnter: () => void
  loadMore: () => void
  /** 마지막 조각만 지운다(SB-20, 0건 안내에서 손을 칸으로 옮기지 않게). */
  dropLastFragment: () => void
  /** 검색어를 통째로 지운다(SB-20). */
  clearQuery: () => void
}

export function useSearchPatients(): SearchState {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<SearchPatientRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)

  const reqSeq = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout>>()
  const cursorRef = useRef<string | null>(null)
  const lastRunQuery = useRef('')

  const run = useCallback(async (q: string) => {
    const seq = ++reqSeq.current // RUN-05 — 이 검색의 표식. 내가 마지막이 아니면 결과를 버린다.
    lastRunQuery.current = q
    setSearching(true)
    try {
      const res = await searchPatients(q)
      if (seq !== reqSeq.current) return // RUN-05 — 늦게 온 지난 검색은 버린다
      setRows(res.rows) // RUN-04 — 도착해서야 갈아끼운다(그전까지 옛 목록 유지)
      cursorRef.current = res.next_cursor
      setHasMore(res.has_more)
      setLoadMoreFailed(false)
      setHasSearched(true)
    } catch {
      if (seq !== reqSeq.current) return
      setRows([])
      setHasMore(false)
      setHasSearched(true)
    } finally {
      if (seq === reqSeq.current) setSearching(false)
    }
  }, [])

  const resetToInitial = useCallback(() => {
    reqSeq.current++ // 진행 중이던 검색을 무효화
    cursorRef.current = null
    setRows([])
    setHasMore(false)
    setHasSearched(false)
    setSearching(false)
    setLoadMoreFailed(false)
  }, [])

  const onChange = useCallback(
    (q: string) => {
      setQuery(q)
      clearTimeout(debounce.current)
      if (q.trim() === '') {
        resetToInitial() // 비우면 사용법 안내로 돌아간다(SB-17)
        return
      }
      debounce.current = setTimeout(() => run(q), DEBOUNCE_MS) // RUN-01 — 손이 멈추면 0.4초 뒤
    },
    [run, resetToInitial],
  )

  const onEnter = useCallback(() => {
    clearTimeout(debounce.current)
    if (query.trim() === '') return
    run(query) // RUN-02 — Enter는 기다리지 않고 지금 당장
  }, [run, query])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    const cursor = cursorRef.current
    if (!cursor) return
    setLoadingMore(true)
    setLoadMoreFailed(false)
    try {
      const res = await searchPatients(lastRunQuery.current, cursor)
      setRows((prev) => [...prev, ...res.rows]) // RESULT-04 — 이미 뜬 줄을 가리지 않고 이어 붙인다
      cursorRef.current = res.next_cursor
      setHasMore(res.has_more)
    } catch {
      setLoadMoreFailed(true) // RESULT-06 — 받은 줄은 그대로 두고 맨 아래 [다시 시도]
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore])

  const dropLastFragment = useCallback(() => {
    const next = query.trim().split(/\s+/).slice(0, -1).join(' ')
    onChange(next)
    if (next.trim() !== '') run(next)
  }, [query, onChange, run])

  const clearQuery = useCallback(() => onChange(''), [onChange])

  return {
    query,
    rows,
    hasMore,
    hasSearched,
    searching,
    loadingMore,
    loadMoreFailed,
    onChange,
    onEnter,
    loadMore,
    dropLastFragment,
    clearQuery,
  }
}
