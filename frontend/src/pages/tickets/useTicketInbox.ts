import { useCallback, useEffect, useState } from 'react'
import type { StaffChatApi, InboxTicket, TicketStatus } from '../../api/staffChat'
import { useTicketsRealtime, type LiveStatus } from './useTicketsRealtime'

// 문의 티켓함의 상태 기계 — 상태 탭·목록 조회·접수순·빈/로딩/오류(전체·부분)·모르는 상태 방어·
// 계약 없음 BLOCKED·Realtime 정합화를 담는다. 화면(Tickets.tsx)은 이 훅의 phase만 읽어 그린다.

const TABS: { key: TicketStatus; label: string }[] = [
  { key: 'pending', label: '새 문의' },
  { key: 'in_progress', label: '처리 중' },
  { key: 'answered', label: '답변 완료' },
]
const VALID = new Set<TicketStatus>(['pending', 'in_progress', 'answered'])
export type Phase = 'loading' | 'empty' | 'ready' | 'error' | 'blocked'

// 접수순 계약(created_at ASC, id ASC) — 서버가 이미 준 순서를 존중하되 마지막 키로 방어한다.
const byQueue = (a: InboxTicket, b: InboxTicket) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export function useTicketInbox(api: StaffChatApi, opts: { contractReady?: boolean } = {}) {
  const contractReady = opts.contractReady !== false
  const [tab, setTab] = useState<TicketStatus>('pending')
  const [tickets, setTickets] = useState<InboxTicket[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [partialError, setPartialError] = useState(false)
  const [counts, setCounts] = useState<Partial<Record<TicketStatus, number>>>({})
  const [live, setLive] = useState<LiveStatus>('connected')

  const load = useCallback(async () => {
    if (!contractReady) {
      setPhase('blocked') // BLOCK-01: 계약 없으면 가짜 0건 금지
      return
    }
    const hadRows = tickets.length > 0
    if (!hadRows) setPhase('loading') // LOAD-01: 0건 문구를 먼저 보여주지 않는다
    try {
      const rows = await api.listTickets(tab)
      if (rows.some((r) => !VALID.has(r.status))) {
        setPhase('error') // EXC-01: 모르는 상태를 탭으로 임의 번역하지 않는다
        return
      }
      const sorted = [...rows].sort(byQueue) // ORDER-01·02
      setTickets(sorted)
      setPartialError(false)
      setCounts((c) => ({ ...c, [tab]: sorted.length })) // EMPTY-01: 선택 탭 건수만 확정(타 탭 0 단정 X)
      setPhase(sorted.length === 0 ? 'empty' : 'ready')
    } catch {
      if (hadRows) setPartialError(true) // ERR-02: 보던 행 유지 + 오류
      else setPhase('error') // ERR-01: 전체 오류(0건으로 바꾸지 않음)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, tab, contractReady, tickets.length])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, contractReady])

  // LIVE-04/05: 끊김·복구를 훅이 노출하는 live로. 복구 시 서버 재조회로 누락·중복을 정합화한다.
  const onLiveChange = useCallback(
    (next: LiveStatus) => {
      setLive(next)
      if (next === 'connected') void load() // LIVE-05
    },
    [load],
  )

  // LIVE-01~03: support_tickets 변경 구독 → 현재 탭·건수 재조회(목록만 갱신, 상세 자동 열기·이동 없음).
  useTicketsRealtime(() => void load(), onLiveChange)

  return { tabs: TABS, tab, setTab, tickets, counts, phase, partialError, live, onLiveChange, retry: load }
}
