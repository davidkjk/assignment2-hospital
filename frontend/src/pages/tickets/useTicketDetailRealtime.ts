import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'

// [TICKET-DETAIL-LIVE-*] 상세 라이브 — 문의함(useTicketsRealtime)과 같은 방식이되 두 테이블을 함께 본다.
//   chat_messages(새 메시지 LIVE-01)·support_tickets(담당·상태 변경 LIVE-02). 어떤 행이 바뀌었는지는
//   화면이 서버에서 다시 받는다(콜백은 "다시 조회하라"는 신호일 뿐). 끊김·복구는 onStatus로 올린다.
//   ⚠️ 문의함과 다른 채널 이름을 써 목록 구독과 섞이지 않게 한다(탭 하나에 목록·상세가 동시에 살 수 있음).

const CHANNEL_NAME = 'staff-ticket-detail'

export type LiveStatus = 'connected' | 'disconnected'

export function useTicketDetailRealtime(
  onMessage: () => void,
  onTicket: () => void,
  onStatus: (s: LiveStatus) => void,
): void {
  const refs = useRef({ onMessage, onTicket, onStatus })
  refs.current = { onMessage, onTicket, onStatus }

  useEffect(() => {
    const channel = supabase
      .channel(CHANNEL_NAME)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => refs.current.onMessage())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => refs.current.onTicket())
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          refs.current.onStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          refs.current.onStatus('disconnected')
        }
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
