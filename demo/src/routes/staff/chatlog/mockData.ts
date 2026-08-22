export type ChatChannel = 'app' | 'web'
export type ChatRoute = 'ai_resolved' | 'staff_handoff' | 'booking_support'

export interface ChatTurn {
  id: string
  sender: '환자' | 'AI' | '직원'
  text: string
  time: string
  sources?: string[]
}

export interface ChatRecord {
  id: string
  channel: ChatChannel
  routeTaken: ChatRoute
  summary: string
  occurredAt: string
  occurredLabel: string
  participant: string
  turns: ChatTurn[]
}

export const CHANNEL_LABEL: Record<ChatChannel, string> = { app: '앱', web: '웹' }
export const ROUTE_LABEL: Record<ChatRoute, string> = {
  ai_resolved: 'AI 해결',
  staff_handoff: '직원 연결',
  booking_support: '예약 상담',
}

export const CHAT_RECORDS: ChatRecord[] = [
  {
    id: 'C-2081', channel: 'app', routeTaken: 'ai_resolved', summary: '진료 전 금식은 몇 시간 해야 하나요?',
    occurredAt: '2026-08-22T09:34:00', occurredLabel: '오늘 09:34', participant: '앱 회원',
    turns: [
      { id: 'ct1', sender: '환자', text: '내일 건강검진인데 금식은 언제부터 해야 하나요?', time: '09:33' },
      { id: 'ct2', sender: 'AI', text: '검진 전날 밤 9시부터 물을 포함해 금식해 주세요. 복용 중인 약은 병원 안내를 확인해 주세요.', time: '09:34', sources: ['건강검진 전 준비 안내 v3'] },
    ],
  },
  {
    id: 'C-2079', channel: 'web', routeTaken: 'staff_handoff', summary: '혈압약을 추가로 복용해도 되나요?',
    occurredAt: '2026-08-22T09:16:00', occurredLabel: '오늘 09:16', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct3', sender: '환자', text: '아침에 약을 먹었는지 기억이 안 나는데 한 알 더 먹어도 될까요?', time: '09:16' },
      { id: 'ct4', sender: 'AI', text: '추가 복용 전에 의료진 확인이 필요합니다. 직원 상담으로 연결할게요.', time: '09:17', sources: ['복약 안전 응답 원칙'] },
      { id: 'ct5', sender: '직원', text: '담당 의사에게 확인 중입니다. 추가로 복용하지 말고 잠시 기다려 주세요.', time: '09:22' },
    ],
  },
  {
    id: 'C-2072', channel: 'app', routeTaken: 'booking_support', summary: '주말 예약으로 변경하고 싶어요',
    occurredAt: '2026-08-22T08:21:00', occurredLabel: '오늘 08:21', participant: '앱 회원',
    turns: [
      { id: 'ct6', sender: '환자', text: '평일 예약을 토요일로 바꾸고 싶어요.', time: '08:20' },
      { id: 'ct7', sender: 'AI', text: '변경 가능한 일정을 직원이 확인하도록 상담으로 연결해 드릴게요.', time: '08:21' },
      { id: 'ct8', sender: '직원', text: '8월 29일 토요일 오전 11시가 가능합니다.', time: '08:28' },
    ],
  },
  {
    id: 'C-2058', channel: 'web', routeTaken: 'ai_resolved', summary: '병원 주차장 운영 시간이 궁금해요',
    occurredAt: '2026-08-21T17:40:00', occurredLabel: '어제 17:40', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct9', sender: '환자', text: '주차장은 몇 시까지 이용할 수 있나요?', time: '17:39' },
      { id: 'ct10', sender: 'AI', text: '병원 주차장은 평일 오후 9시까지 운영합니다.', time: '17:40', sources: [] },
    ],
  },
]

export type ChannelFilter = 'all' | ChatChannel
export type RouteFilter = 'all' | ChatRoute

export function filterChatRecords(records: ChatRecord[], channel: ChannelFilter, route: RouteFilter): ChatRecord[] {
  return records.filter((record) =>
    (channel === 'all' || record.channel === channel)
    && (route === 'all' || record.routeTaken === route),
  )
}
