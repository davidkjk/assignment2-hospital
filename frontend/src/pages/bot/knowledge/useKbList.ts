import { useCallback, useEffect, useRef, useState } from 'react'
import type { KbAdminApi, KbDoc, KbQuery } from '../../../api/kbAdmin'

// 병원 안내자료 목록의 상태 기계 — 분류·상태 필터, 재조회, 로딩·0건·오류를 담는다.
// 화면(KbList)은 이 훅의 phase만 읽어 그린다.
//
// ⭐ 상태 enum의 표시명·정렬(KBADM-LIST-03)은 서버 계약이 없어 statusContract를 'unknown'으로 노출하고
//    표시명·정렬을 발명하지 않는다. 조회 실패(error)·집계 부재를 0건(empty)으로 표시하지 않는다(LIST-06·08).

export type Phase = 'loading' | 'ready' | 'empty' | 'error'

export interface KbListState {
  phase: Phase
  docs: KbDoc[]
  filters: KbQuery
  setFilter: (patch: Partial<KbQuery>) => void
  retry: () => void
  statusContract: 'unknown' // 상태 표시명·정렬은 계약 확정 전까지 발명하지 않는다(LIST-03)
}

// undefined 키는 필터 해제('전체')로 본다 — 병합 후 값 없는 키를 걷어낸다.
function merge(base: KbQuery, patch: Partial<KbQuery>): KbQuery {
  const next: KbQuery = { ...base, ...patch }
  if (next.category == null) delete next.category
  if (next.status == null) delete next.status
  return next
}

export function useKbList(api: KbAdminApi): KbListState {
  const [filters, setFilters] = useState<KbQuery>({})
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const reqId = useRef(0)

  const load = useCallback(
    (q: KbQuery) => {
      const mine = ++reqId.current
      setPhase('loading') // 로딩 중에도 filters·이전 docs는 유지한다(LIST-07)
      api
        .listDocs(q)
        .then((rows) => {
          if (mine !== reqId.current) return // 늦게 온 이전 요청은 버린다
          setDocs(rows)
          setPhase(rows.length === 0 ? 'empty' : 'ready')
        })
        .catch(() => {
          if (mine !== reqId.current) return
          setPhase('error') // 실패를 0건으로 대체하지 않는다(LIST-08)
        })
    },
    [api],
  )

  useEffect(() => {
    load(filters)
  }, [filters, load])

  const setFilter = useCallback((patch: Partial<KbQuery>) => {
    setFilters((prev) => merge(prev, patch))
  }, [])

  const retry = useCallback(() => load(filters), [load, filters])

  return { phase, docs, filters, setFilter, retry, statusContract: 'unknown' }
}
