import { useLocation, useNavigate } from 'react-router-dom'
import { MessageCircle, ShieldCheck } from '@/components/icons'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { ChatEngine } from '@/components/chatbot/ChatEngine'
import { appScript } from '@/components/chatbot/scripts'
import type { BotBubble } from '@/components/chatbot/types'

// AI 상담 탭(하단 탭 5번째). 대본형 라이브 상담봇 — 실제 LLM 없이 정해진 길을 재생한다.
// 진료과 추천 → 상담 중 예약, 위치 안내, 직원 연결, 긴급(119)까지(요구사항 5장).
// 예약 취소 마감 후 연결(CANCEL-LATE-10)로 들어오면 예약 정보·연결 사실·예약 유지를
// 알리는 첫 인사로 시작한다.
type CancelContext = { context: 'cancel'; patientName: string; when: string; dept: string }

export function Chat() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as CancelContext | null
  const cancel = state?.context === 'cancel' ? state : null

  const intro: BotBubble[] | undefined = cancel
    ? [
        {
          text: `${cancel.patientName}님, ${cancel.when} ${cancel.dept} 예약 취소 상담이 연결됐어요. 직원이 확인하는 동안 예약은 그대로 유지돼요. 무엇이 궁금하세요?`,
        },
      ]
    : undefined

  return (
    <PhoneFrame>
      <div data-testid="chat" className="flex h-full flex-col">
        <ScreenHeader title="AI 상담봇" icon={<MessageCircle className="h-5 w-5" />} />

        {/* 안전 안내(CHAT-ROOM-SAFE-01) — 진단·처방이 아님을 늘 보인다. */}
        <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-xs text-primary/90">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>진단이나 처방이 아닌 진료과·병원 이용 안내예요.</span>
        </div>

        <ChatEngine
          script={appScript}
          intro={intro}
          showStartBubbles={!cancel}
          onNavigate={(to) => navigate(to)}
        />
      </div>
    </PhoneFrame>
  )
}
