import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'

// [TICKET-DETAIL-TYPING-01] 직원이 답변을 작성 중이면 "직원 입력 중"을 환자 상담방에 보낸다.
// DB를 건드리지 않는 **일회성 신호(ephemeral broadcast)** — 같은 thread를 키로 한 Realtime 채널을 쓴다.
// 채널 이름은 환자앱과 정확히 같아야 신호가 닿는다: `chat-typing:<threadId>`.
// ⛔ 온라인 초록 점은 만들지 않는다(TICKET-DETAIL-SCOPE-01). 유휴 3초 해제(디바운스)는
//    useTicketDetail.setTyping이 이미 하고, 이 훅은 송신 transport(emit)만 제공한다.

export function typingChannelName(threadId: string): string {
  return `chat-typing:${threadId}`
}

type Channel = ReturnType<typeof supabase.channel>

/** thread별 타이핑 broadcast 채널을 열고, 켬/끔 신호를 보내는 emit 함수를 돌려준다.
 *  threadId가 없으면(로딩 전) no-op — 상세가 로드되면 effect가 채널을 다시 연다. */
export function useTypingChannel(threadId: string | undefined): (on: boolean) => void {
  const chanRef = useRef<Channel | null>(null)
  useEffect(() => {
    if (!threadId) return
    // self:false — 내가 보낸 신호를 나는 다시 받지 않는다(직원은 자기 타이핑을 볼 필요 없음).
    const ch = supabase.channel(typingChannelName(threadId), {
      config: { broadcast: { self: false } },
    })
    ch.subscribe()
    chanRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      chanRef.current = null
    }
  }, [threadId])

  return useCallback((on: boolean) => {
    const ch = chanRef.current
    if (!ch) return
    void ch.send({ type: 'broadcast', event: 'typing', payload: { role: 'staff', on } })
  }, [])
}
