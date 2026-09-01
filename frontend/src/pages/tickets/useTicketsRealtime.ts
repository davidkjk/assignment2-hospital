import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'

// [TICKET-INBOX-LIVE-*] 문의함 실시간 — 캘린더(useCalendarRealtime)와 같은 방식·같은 채널을 쓴다.
//   ⚠️ 새 연결을 열지 않는다(탭 하나당 하나 · SHELL-LIVE-02) — 고정 채널 이름을 공유한다.
//   support_tickets 생성·상태 변경을 감시해 화면이 통째로 다시 조회하게 한다(어떤 행이 바뀌었는지는
//   화면이 서버에서 다시 받는다). 끊김·복구는 onStatus로 훅에 올려, 훅이 live 상태를 노출한다.

const CHANNEL_NAME = 'staff-realtime'
const WATCHED_TABLES = ['support_tickets'] as const

export type LiveStatus = 'connected' | 'disconnected'

/**
 * onChange: 목록을 다시 조회하는 콜백. onStatus: 연결 끊김·복구 알림.
 * 매 렌더 새 함수여도 구독을 다시 만들지 않도록 ref로 최신값을 읽는다(useCalendarRealtime와 같은 관례).
 */
export function useTicketsRealtime(onChange: () => void, onStatus: (s: LiveStatus) => void): void {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    let channel = supabase.channel(CHANNEL_NAME)
    for (const table of WATCHED_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChangeRef.current(),
      )
    }
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        onStatusRef.current('connected')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onStatusRef.current('disconnected')
      }
    })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
