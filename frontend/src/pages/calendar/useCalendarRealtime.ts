import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// [CAL-LIVE-*] 캘린더 실시간 — ⭐ 중복 예약을 「저장할 때 갈리는 문제」가 아니라
//   「저장 전에 막을 수 있는 문제」로 옮긴다(CAL-RACE-02). 그러려면 격자가 실시간이어야 한다.
//   셸 배지·/today·/queue와 같은 연결을 쓴다(탭 하나당 하나 · SHELL-LIVE-02) — 채널 이름을
//   고정해 새 연결을 열지 않는다.

const CHANNEL_NAME = 'staff-realtime'

// ⚠ 캘린더가 그리는 세 테이블 — 예약 막대·상담 ⚠ 배지가 여기서 바뀐다.
const WATCHED_TABLES = ['appointments', 'appointment_slots', 'support_requests'] as const

export interface CalendarRealtime {
  /** 연결이 끊긴 시각. 끊기지 않았으면 null(CAL-LIVE-03 배너의 기준 시각 계산에 쓴다). */
  staleSince: Date | null
}

/**
 * onChange는 격자를 다시 조회하는 콜백이다(어떤 행이 바뀌었는지는 화면이 통째로 다시 받는다).
 * ⚠️ 채널을 만들지 않고 구독만 하는 것이 원칙이나(SHELL-LIVE-02), 셸 채널 공유 지점이 아직
 *    없어 고정 이름 채널을 쓴다 — 셸이 같은 이름으로 붙으면 한 연결로 합쳐진다.
 */
export function useCalendarRealtime(onChange: (payload: unknown) => void): CalendarRealtime {
  const [staleSince, setStaleSince] = useState<Date | null>(null)
  // onChange가 매 렌더 새 함수여도 구독을 다시 만들지 않도록 ref로 최신값을 읽는다.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let channel = supabase.channel(CHANNEL_NAME)
    for (const table of WATCHED_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: unknown) => onChangeRef.current(payload),
      )
    }
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        setStaleSince(null)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // 이미 끊긴 시각이 있으면 유지한다 — 처음 끊긴 순간이 기준이다.
        setStaleSince((prev) => prev ?? new Date())
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { staleSince }
}
