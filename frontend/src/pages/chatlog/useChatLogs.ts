import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatLogApi, ChatLogRow, ChatLogQuery } from '../../api/staffChatLog'

// 상담봇 기록의 상태 기계 — 채널·갈래 필터, 재조회, 로딩·0건·오류, 라이브·정렬(확인 필요),
// 계약 밖 값 보존을 담는다. 화면(ChatLogList)은 이 훅의 phase만 읽어 그린다.
//
// ⭐ Realtime 구독 여부(LIVE-01)·정렬 방향·동점 키·페이지(ORDER-01)는 근거가 없어 unknown으로 노출하고
//    자동/수동·정렬을 발명하지 않는다. 계약 밖 채널·갈래 값(EXC-01)은 앱·웹/기존 갈래로 치환하지 않는다.

export type Phase = 'loading' | 'ready' | 'empty' | 'error'

export interface ChatLogsState {
  phase: Phase
  rows: ChatLogRow[]
  filters: ChatLogQuery
  setFilter: (patch: Partial<ChatLogQuery>) => void
  retry: () => void
  live: { mode: 'unknown' } // 근거 없음 — 티켓함처럼 자동이라 추측하지 않는다(LIVE-01)
  order: { contract: 'unknown' } // 서버 계약 확정 전까지 정렬을 발명하지 않는다(ORDER-01)
}

// undefined 키는 필터 해제('전체')로 본다 — 병합 후 값 없는 키를 걷어낸다.
function merge(base: ChatLogQuery, patch: Partial<ChatLogQuery>): ChatLogQuery {
  const next: ChatLogQuery = { ...base, ...patch }
  if (next.channel == null) delete next.channel
  if (next.routeTaken == null) delete next.routeTaken
  return next
}

export function useChatLogs(api: ChatLogApi): ChatLogsState {
  const [filters, setFilters] = useState<ChatLogQuery>({})
  const [rows, setRows] = useState<ChatLogRow[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const seq = useRef(0) // 늦게 도착한 옛 조회가 새 결과를 덮지 않게(경쟁 방어)
  const apiRef = useRef(api) // load를 api identity에서 떼어낸다(매 렌더 새 api여도 재조회 폭주 방지)
  apiRef.current = api

  const load = useCallback(async (q: ChatLogQuery) => {
    const my = ++seq.current
    setPhase('loading') // LOAD-01: 0건 문구를 먼저 보여주지 않는다
    try {
      const next = await apiRef.current.listLogs(q)
      if (my !== seq.current) return
      // EXC-01: 계약 밖 값도 버리지 않고 그대로 싣는다(치환·필터 금지).
      setRows(next)
      setPhase(next.length === 0 ? 'empty' : 'ready')
    } catch {
      if (my !== seq.current) return
      setRows([])
      setPhase('error') // ERR-01: 0건으로 위장하지 않는다
    }
  }, [])

  useEffect(() => {
    void load(filters)
  }, [load, filters])

  const setFilter = useCallback((patch: Partial<ChatLogQuery>) => {
    // FILTER-03: 필터를 바꾸면 새 조건으로 다시 조회한다(effect가 filters 변화를 받아 load).
    setFilters((prev) => merge(prev, patch))
  }, [])

  const retry = useCallback(() => void load(filters), [load, filters])

  return { phase, rows, filters, setFilter, retry, live: { mode: 'unknown' }, order: { contract: 'unknown' } }
}
