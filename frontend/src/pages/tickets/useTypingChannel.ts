import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'

// [TICKET-DETAIL-TYPING-01] 직원이 답변을 작성 중이면 "직원 입력 중"을 환자 상담방에 보낸다.
// [TICKET-DETAIL-PRESENCE-01/Q18③] 직원이 상담 상세를 **열어 보는 중**이면 "직원이 확인 중"을 환자에게 알린다 —
//   상세가 열려 채널이 구독되면 viewing:on, 닫히면(언마운트) viewing:off를 같은 채널로 보낸다. 배정(claim)과
//   무관한 실열람이라 환자 배지는 connecting일 때만 "직원이 확인 중이에요"로 바뀐다(초록 점·답변 보장 아님).
// DB를 건드리지 않는 **일회성 신호(ephemeral broadcast)** — 같은 thread를 키로 한 Realtime 채널을 쓴다.
// 채널 이름은 환자앱과 정확히 같아야 신호가 닿는다: `chat-typing:<threadId>`.
// ⛔ 온라인 초록 점은 만들지 않는다(TICKET-DETAIL-SCOPE-01). 유휴 3초 해제(디바운스)는
//    useTicketDetail.setTyping이 이미 하고, 이 훅은 송신 transport(emit)만 제공한다.

export function typingChannelName(threadId: string): string {
  return `chat-typing:${threadId}`
}

type Channel = ReturnType<typeof supabase.channel>

/** thread별 broadcast 채널을 열고, 타이핑 켬/끔 신호를 보내는 emit 함수를 돌려준다.
 *  같은 채널로 열람 presence(viewing on/off)도 보낸다 — 구독되면 on, 언마운트 시 off.
 *  threadId가 없으면(로딩 전) no-op — 상세가 로드되면 effect가 채널을 다시 연다. */
export function useTypingChannel(threadId: string | undefined): (on: boolean) => void {
  const chanRef = useRef<Channel | null>(null)
  useEffect(() => {
    if (!threadId) return
    // self:false — 내가 보낸 신호를 나는 다시 받지 않는다(직원은 자기 타이핑·열람을 볼 필요 없음).
    const ch = supabase.channel(typingChannelName(threadId), {
      config: { broadcast: { self: false } },
    })
    ch.subscribe((status: string) => {
      // 구독 완료(SUBSCRIBED) 후에 보내야 신호가 실제로 나간다(구독 전 send는 유실).
      if (status === 'SUBSCRIBED') {
        void ch.send({ type: 'broadcast', event: 'viewing', payload: { role: 'staff', on: true } })
      }
    })
    chanRef.current = ch
    return () => {
      // 상세를 닫으면 열람 종료 — 환자 배지가 "직원이 확인 중"에서 내려간다.
      void ch.send({ type: 'broadcast', event: 'viewing', payload: { role: 'staff', on: false } })
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
