import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatLogApi, ChatLogRow, ChatLogQuery, LogCounts, Channel } from '../../api/staffChatLog'
import { periodRange, type PeriodValue } from '../../components/staff-ui'

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
  counts: LogCounts // 필터칩 배지(채널·기간별 갈래 개수)
  period: PeriodValue // 기간 선택기 값
  setPeriod: (next: PeriodValue) => void
  live: { mode: 'unknown' } // 근거 없음 — 티켓함처럼 자동이라 추측하지 않는다(LIVE-01)
  order: { contract: 'unknown' } // 서버 계약 확정 전까지 정렬을 발명하지 않는다(ORDER-01)
}

// undefined 키는 필터 해제('전체')로 본다 — 병합 후 값 없는 키를 걷어낸다.
function merge(base: ChatLogQuery, patch: Partial<ChatLogQuery>): ChatLogQuery {
  const next: ChatLogQuery = { ...base, ...patch }
  if (next.channel == null) delete next.channel
  if (next.routeTaken == null) delete next.routeTaken
  if (next.from == null) delete next.from
  if (next.to == null) delete next.to
  return next
}

export function useChatLogs(api: ChatLogApi): ChatLogsState {
  const [filters, setFilters] = useState<ChatLogQuery>({})
  const [rows, setRows] = useState<ChatLogRow[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  // 기본 기간은 '전체'(from/to 없음) — 기록은 돌아보는 곳이라 전 기간 노출로 시작한다.
  const [period, setPeriodState] = useState<PeriodValue>(() => periodRange('전체'))
  const [counts, setCounts] = useState<LogCounts>({ total: 0, counts: {} })
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

  // 개수는 채널·기간에만 걸린다(갈래 필터 무관) — 그 셋이 바뀔 때만 다시 센다.
  const loadCounts = useCallback(async (q: { channel?: Channel; from?: string; to?: string }) => {
    try {
      setCounts(await apiRef.current.listCounts(q))
    } catch {
      setCounts({ total: 0, counts: {} })
    }
  }, [])
  useEffect(() => {
    void loadCounts({ channel: filters.channel, from: filters.from, to: filters.to })
  }, [loadCounts, filters.channel, filters.from, filters.to])

  const setFilter = useCallback((patch: Partial<ChatLogQuery>) => {
    // FILTER-03: 필터를 바꾸면 새 조건으로 다시 조회한다(effect가 filters 변화를 받아 load).
    setFilters((prev) => merge(prev, patch))
  }, [])

  // 기간을 바꾸면 period와 함께 filters의 from/to를 갱신한다('전체'면 날짜 없음).
  const setPeriod = useCallback((next: PeriodValue) => {
    setPeriodState(next)
    const dated = next.preset !== '전체' && next.from && next.to
    setFilters((prev) => merge(prev, { from: dated ? next.from : undefined, to: dated ? next.to : undefined }))
  }, [])

  const retry = useCallback(() => void load(filters), [load, filters])

  return { phase, rows, filters, setFilter, retry, counts, period, setPeriod, live: { mode: 'unknown' }, order: { contract: 'unknown' } }
}
