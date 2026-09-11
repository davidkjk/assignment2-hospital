import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// [TICKET-DETAIL-TYPING-01] 직원이 답변을 작성 중이면 "직원 입력 중"을 환자 상담방에 보낸다.
// [TICKET-DETAIL-PRESENCE-01/Q18③] 직원이 상담 상세를 **열어 보는 중**이면 "직원이 확인 중"을 환자에게 알린다 —
//   상세가 열려 채널이 구독되면 viewing:on, 닫히면(언마운트) viewing:off를 같은 채널로 보낸다. 배정(claim)과
//   무관한 실열람이라 환자 배지는 connecting일 때만 "직원이 확인 중이에요"로 바뀐다(초록 점·답변 보장 아님).
// [TICKET-DETAIL-PATIENT-PRESENCE-01·PATIENT-TYPING-01] 방향은 양쪽이다 — 같은 채널로 환자앱/웹챗이
//   `role:'patient'`의 viewing(방 열림)·typing(입력 중)을 보낸다. 이 훅이 그걸 **구독**해 직원 화면에
//   "환자 접속 중"/"환자 입력 중"을 띄운다(self:false라 직원은 자기 신호를 안 받고 환자 것만 받는다).
//   끔 신호 유실 대비 안전 타임아웃(typing 6초·viewing 12초, 환자앱 대칭).
// DB를 건드리지 않는 **일회성 신호(ephemeral broadcast)** — 같은 thread를 키로 한 Realtime 채널을 쓴다.
// 채널 이름은 환자앱과 정확히 같아야 신호가 닿는다: `chat-typing:<threadId>`.
// ⛔ 온라인 초록 점은 만들지 않는다(TICKET-DETAIL-SCOPE-01). 유휴 3초 해제(디바운스)는
//    useTicketDetail.setTyping이 이미 하고, 이 훅은 송신 transport(send)와 수신 구독을 제공한다.

export function typingChannelName(threadId: string): string {
  return `chat-typing:${threadId}`
}

type Channel = ReturnType<typeof supabase.channel>

export interface TypingChannel {
  /** 직원 입력 중 켬/끔을 환자에게 보낸다(디바운스는 setTyping). */
  send: (on: boolean) => void
  /** 환자가 입력 중인지(환자앱/웹챗의 typing 수신). */
  patientTyping: boolean
  /** 환자가 상담방을 열어 보는 중인지(환자앱/웹챗의 viewing 수신). */
  patientViewing: boolean
}

/** thread별 broadcast 채널을 열고 ⑴ 직원 typing/viewing을 환자에게 보내며 ⑵ 환자 typing/viewing을
 *  구독해 돌려준다. threadId가 없으면(로딩 전) no-op — 상세가 로드되면 effect가 채널을 다시 연다. */
export function useTypingChannel(threadId: string | undefined, onPatientRead?: () => void): TypingChannel {
  const chanRef = useRef<Channel | null>(null)
  const [patientTyping, setPatientTyping] = useState(false)
  const [patientViewing, setPatientViewing] = useState(false)
  const typingOff = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewingOff = useRef<ReturnType<typeof setTimeout> | null>(null)
  // [F6] 환자 읽음 신호 콜백을 ref로 최신 유지(effect 재구독 없이). 서버가 chat-typing 채널로 보내는
  //   'patient_read'를 받아 대화를 재조회하면 '환자 미확인' 배지가 실시간으로 걷힌다.
  const onPatientReadRef = useRef(onPatientRead)
  onPatientReadRef.current = onPatientRead

  useEffect(() => {
    if (!threadId) {
      setPatientTyping(false)
      setPatientViewing(false)
      return
    }
    // self:false — 내가 보낸 신호를 나는 다시 받지 않는다(직원은 자기 타이핑·열람을 볼 필요 없음).
    const ch = supabase.channel(typingChannelName(threadId), {
      config: { broadcast: { self: false } },
    })
    // 환자(role:patient) 입력 중 — 6초 안전 타임아웃(끔 유실 대비).
    ch.on('broadcast', { event: 'typing' }, (msg: { payload?: unknown }) => {
      const data = (msg.payload ?? msg) as { role?: string; on?: boolean }
      if (data.role !== 'patient') return
      if (typingOff.current) clearTimeout(typingOff.current)
      setPatientTyping(!!data.on)
      if (data.on) typingOff.current = setTimeout(() => setPatientTyping(false), 6000)
    })
    // 환자(role:patient) 접속(열람) — 12초 안전 타임아웃.
    ch.on('broadcast', { event: 'viewing' }, (msg: { payload?: unknown }) => {
      const data = (msg.payload ?? msg) as { role?: string; on?: boolean }
      if (data.role !== 'patient') return
      if (viewingOff.current) clearTimeout(viewingOff.current)
      setPatientViewing(!!data.on)
      if (data.on) viewingOff.current = setTimeout(() => setPatientViewing(false), 12000)
    })
    // [F6] 환자/익명이 읽음(서버 patient_read 신호) — 대화를 재조회해 '환자 미확인'을 실시간으로 걷는다.
    ch.on('broadcast', { event: 'patient_read' }, () => onPatientReadRef.current?.())
    ch.subscribe((status: string) => {
      // 구독 완료(SUBSCRIBED) 후에 보내야 신호가 실제로 나간다(구독 전 send는 유실).
      if (status === 'SUBSCRIBED') {
        void ch.send({ type: 'broadcast', event: 'viewing', payload: { role: 'staff', on: true } })
      }
    })
    chanRef.current = ch
    return () => {
      if (typingOff.current) clearTimeout(typingOff.current)
      if (viewingOff.current) clearTimeout(viewingOff.current)
      // 상세를 닫으면 열람 종료 — 환자 배지가 "직원이 확인 중"에서 내려간다.
      void ch.send({ type: 'broadcast', event: 'viewing', payload: { role: 'staff', on: false } })
      supabase.removeChannel(ch)
      chanRef.current = null
      setPatientTyping(false)
      setPatientViewing(false)
    }
  }, [threadId])

  const send = useCallback((on: boolean) => {
    const ch = chanRef.current
    if (!ch) return
    void ch.send({ type: 'broadcast', event: 'typing', payload: { role: 'staff', on } })
  }, [])

  return { send, patientTyping, patientViewing }
}
