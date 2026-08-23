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
    id: 'C-2070', channel: 'app', routeTaken: 'ai_resolved', summary: '사전 문진은 언제까지 작성하면 되나요?',
    occurredAt: '2026-08-22T08:05:00', occurredLabel: '오늘 08:05', participant: '앱 회원',
    turns: [
      { id: 'ct11', sender: '환자', text: '사전 문진표는 진료 당일에 써도 되나요?', time: '08:04' },
      { id: 'ct12', sender: 'AI', text: '방문 전에 미리 작성해 주시면 대기 시간이 줄어듭니다. 당일 접수 전까지 작성하시면 됩니다.', time: '08:05', sources: ['사전 문진 안내 v2'] },
    ],
  },
  {
    id: 'C-2066', channel: 'web', routeTaken: 'ai_resolved', summary: '진료과별 진료 시간이 궁금해요',
    occurredAt: '2026-08-22T07:48:00', occurredLabel: '오늘 07:48', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct13', sender: '환자', text: '정형외과는 몇 시부터 진료하나요?', time: '07:47' },
      { id: 'ct14', sender: 'AI', text: '정형외과는 평일 오전 9시부터 오후 5시까지 진료합니다. 점심시간은 낮 12시 30분부터 1시 30분까지입니다.', time: '07:48', sources: ['진료 시간 안내 v4'] },
    ],
  },
  {
    id: 'C-2061', channel: 'web', routeTaken: 'ai_resolved', summary: '병원 주차장 운영 시간이 궁금해요',
    occurredAt: '2026-08-21T17:40:00', occurredLabel: '어제 17:40', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct9', sender: '환자', text: '주차장은 몇 시까지 이용할 수 있나요?', time: '17:39' },
      { id: 'ct10', sender: 'AI', text: '병원 주차장은 평일 오후 9시까지 운영합니다.', time: '17:40', sources: [] },
    ],
  },
  {
    id: 'C-2057', channel: 'app', routeTaken: 'staff_handoff', summary: '검사 결과지를 다시 받고 싶어요',
    occurredAt: '2026-08-21T16:12:00', occurredLabel: '어제 16:12', participant: '앱 회원',
    turns: [
      { id: 'ct15', sender: '환자', text: '지난주 받은 혈액검사 결과지를 잃어버렸어요. 다시 받을 수 있나요?', time: '16:11' },
      { id: 'ct16', sender: 'AI', text: '검사 결과지 재발급은 본인 확인이 필요해 직원 상담으로 연결해 드릴게요.', time: '16:12', sources: ['진료 기록 발급 절차'] },
      { id: 'ct17', sender: '직원', text: '접수처에서 신분증 확인 후 재발급 가능합니다. 방문 시 알려 주세요.', time: '16:20' },
    ],
  },
  {
    id: 'C-2052', channel: 'app', routeTaken: 'booking_support', summary: '예약을 취소하고 싶어요',
    occurredAt: '2026-08-21T14:03:00', occurredLabel: '어제 14:03', participant: '앱 회원',
    turns: [
      { id: 'ct18', sender: '환자', text: '이번 주 목요일 예약을 취소하려면 어떻게 하나요?', time: '14:02' },
      { id: 'ct19', sender: 'AI', text: '취소 마감 전이라 앱에서 바로 취소하실 수 있어요. 확인을 위해 직원 상담으로도 연결해 드릴게요.', time: '14:03' },
      { id: 'ct20', sender: '직원', text: '목요일 예약 취소 확인해 드렸습니다. 다시 예약을 원하시면 알려 주세요.', time: '14:09' },
    ],
  },
  {
    id: 'C-2044', channel: 'web', routeTaken: 'ai_resolved', summary: '초진인데 어떤 서류가 필요한가요?',
    occurredAt: '2026-08-21T11:27:00', occurredLabel: '어제 11:27', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct21', sender: '환자', text: '처음 방문인데 챙겨야 할 게 있을까요?', time: '11:26' },
      { id: 'ct22', sender: 'AI', text: '신분증을 지참해 주세요. 타 병원 진료 기록이나 복용 중인 약 목록이 있으면 함께 가져오시면 진료에 도움이 됩니다.', time: '11:27', sources: ['초진 안내 v2'] },
    ],
  },
  {
    id: 'C-2038', channel: 'app', routeTaken: 'ai_resolved', summary: '진료비 수납은 카드로 되나요?',
    occurredAt: '2026-08-21T10:14:00', occurredLabel: '어제 10:14', participant: '앱 회원',
    turns: [
      { id: 'ct23', sender: '환자', text: '진료비를 카드로 낼 수 있나요?', time: '10:13' },
      { id: 'ct24', sender: 'AI', text: '신용·체크카드 모두 사용 가능하며, 간편결제도 지원합니다.', time: '10:14', sources: ['수납 안내'] },
    ],
  },
  {
    id: 'C-2031', channel: 'web', routeTaken: 'staff_handoff', summary: '진단서 발급 비용이 궁금해요',
    occurredAt: '2026-08-20T16:50:00', occurredLabel: '8월 20일 16:50', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct25', sender: '환자', text: '일반 진단서 발급 비용이 얼마인가요?', time: '16:49' },
      { id: 'ct26', sender: 'AI', text: '진단서 종류에 따라 비용이 달라 직원이 정확히 안내하도록 상담으로 연결해 드릴게요.', time: '16:50', sources: [] },
      { id: 'ct27', sender: '직원', text: '일반 진단서는 2만 원입니다. 진료 후 접수처에서 발급 가능합니다.', time: '16:58' },
    ],
  },
  {
    id: 'C-2025', channel: 'app', routeTaken: 'booking_support', summary: '같은 날 두 과를 함께 볼 수 있나요?',
    occurredAt: '2026-08-20T13:22:00', occurredLabel: '8월 20일 13:22', participant: '앱 회원',
    turns: [
      { id: 'ct28', sender: '환자', text: '내과랑 정형외과를 같은 날 예약할 수 있나요?', time: '13:21' },
      { id: 'ct29', sender: 'AI', text: '두 과 동시 예약은 시간이 겹치지 않도록 직원이 조율해 드릴게요. 상담으로 연결합니다.', time: '13:22' },
      { id: 'ct30', sender: '직원', text: '내과 오전 10시, 정형외과 오전 11시로 잡아 드렸습니다.', time: '13:31' },
    ],
  },
  {
    id: 'C-2019', channel: 'web', routeTaken: 'ai_resolved', summary: '독감 예방접종은 예약 없이 가능한가요?',
    occurredAt: '2026-08-20T09:41:00', occurredLabel: '8월 20일 09:41', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct31', sender: '환자', text: '독감 주사는 그냥 가면 맞을 수 있나요?', time: '09:40' },
      { id: 'ct32', sender: 'AI', text: '예방접종은 당일 방문 접수도 가능하지만, 대기를 줄이려면 예약을 권장합니다.', time: '09:41', sources: ['예방접종 안내 v1'] },
    ],
  },
  {
    id: 'C-2008', channel: 'app', routeTaken: 'ai_resolved', summary: '앱에서 진료 기록을 볼 수 있나요?',
    occurredAt: '2026-08-19T15:08:00', occurredLabel: '8월 19일 15:08', participant: '앱 회원',
    turns: [
      { id: 'ct33', sender: '환자', text: '지난 진료 내용을 앱에서 확인할 수 있나요?', time: '15:07' },
      { id: 'ct34', sender: 'AI', text: '앱 하단 [기록] 탭에서 지난 진료와 처방 내역을 확인하실 수 있어요.', time: '15:08', sources: ['앱 사용 안내'] },
    ],
  },
  {
    id: 'C-1998', channel: 'web', routeTaken: 'staff_handoff', summary: '증상이 급한데 오늘 진료가 될까요?',
    occurredAt: '2026-08-19T11:35:00', occurredLabel: '8월 19일 11:35', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct35', sender: '환자', text: '갑자기 허리가 심하게 아픈데 오늘 진료 가능할까요?', time: '11:34' },
      { id: 'ct36', sender: 'AI', text: '증상이 급하신 경우 직원이 당일 진료 가능 여부를 바로 확인해 드릴게요.', time: '11:35', sources: [] },
      { id: 'ct37', sender: '직원', text: '정형외과 오후 2시에 당일 접수로 도와드리겠습니다. 방문해 주세요.', time: '11:40' },
    ],
  },
  {
    id: 'C-1985', channel: 'app', routeTaken: 'booking_support', summary: '예약 시간을 앞당기고 싶어요',
    occurredAt: '2026-08-18T17:02:00', occurredLabel: '8월 18일 17:02', participant: '앱 회원',
    turns: [
      { id: 'ct38', sender: '환자', text: '다음 주 예약을 이번 주로 앞당길 수 있나요?', time: '17:01' },
      { id: 'ct39', sender: 'AI', text: '빈 일정을 직원이 확인하도록 상담으로 연결해 드릴게요.', time: '17:02' },
      { id: 'ct40', sender: '직원', text: '이번 주 금요일 오후 3시에 자리가 있어 옮겨 드렸습니다.', time: '17:11' },
    ],
  },
  {
    id: 'C-1972', channel: 'web', routeTaken: 'ai_resolved', summary: '병원 위치와 오시는 길이 궁금해요',
    occurredAt: '2026-08-18T10:19:00', occurredLabel: '8월 18일 10:19', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct41', sender: '환자', text: '지하철로 오려면 몇 번 출구로 나오면 되나요?', time: '10:18' },
      { id: 'ct42', sender: 'AI', text: '2호선 시청역 4번 출구에서 도보 5분 거리입니다. 자세한 약도는 병원 홈페이지에서 확인하실 수 있어요.', time: '10:19', sources: ['오시는 길 안내'] },
    ],
  },
  {
    id: 'C-1960', channel: 'app', routeTaken: 'ai_resolved', summary: '처방받은 약이 떨어졌어요',
    occurredAt: '2026-08-17T14:44:00', occurredLabel: '8월 17일 14:44', participant: '앱 회원',
    turns: [
      { id: 'ct43', sender: '환자', text: '전에 받은 약이 다 떨어졌는데 같은 약을 다시 받으려면 어떻게 하나요?', time: '14:43' },
      { id: 'ct44', sender: 'AI', text: '재처방은 진료가 필요합니다. 같은 증상으로 진료 예약을 도와드릴까요?', time: '14:44', sources: ['재처방 안내'] },
    ],
  },
  {
    id: 'C-1947', channel: 'web', routeTaken: 'staff_handoff', summary: '보험 서류를 발급받고 싶어요',
    occurredAt: '2026-08-17T09:58:00', occurredLabel: '8월 17일 09:58', participant: '익명 웹 사용자',
    turns: [
      { id: 'ct45', sender: '환자', text: '실손보험 청구용 서류를 받으려면 어떻게 하나요?', time: '09:57' },
      { id: 'ct46', sender: 'AI', text: '보험 청구 서류 종류가 여러 가지라 직원이 안내하도록 상담으로 연결해 드릴게요.', time: '09:58', sources: [] },
      { id: 'ct47', sender: '직원', text: '진료비 세부내역서와 진단서가 필요합니다. 접수처에서 발급해 드리겠습니다.', time: '10:05' },
    ],
  },
  {
    id: 'C-1935', channel: 'app', routeTaken: 'ai_resolved', summary: '진료 대기 순서를 알 수 있나요?',
    occurredAt: '2026-08-16T11:12:00', occurredLabel: '8월 16일 11:12', participant: '앱 회원',
    turns: [
      { id: 'ct48', sender: '환자', text: '지금 제 앞에 몇 명이나 기다리고 있나요?', time: '11:11' },
      { id: 'ct49', sender: 'AI', text: '접수 후에는 앱 홈 화면에서 내 앞 대기 인원과 예상 순서를 실시간으로 확인하실 수 있어요.', time: '11:12', sources: ['앱 사용 안내'] },
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
