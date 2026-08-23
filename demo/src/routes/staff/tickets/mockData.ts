export type TicketStatus = 'pending' | 'in_progress' | 'answered'
export type TicketReason = 'general' | 'medical_judgment' | 'cancel_booking' | 'change_booking'
export type Sender = 'AI' | '환자' | '직원'

export interface TicketMessage {
  id: string
  sender: Sender
  text: string
  time: string
  unreadByPatient?: boolean
}

export interface Ticket {
  id: string
  status: TicketStatus
  question: string
  handoffReason: string
  createdAt: string
  createdLabel: string
  assignee: string | null
  reason: TicketReason
  bookingType?: '취소 상담' | '변경 상담'
  bookingSummary?: string
  contactNote?: string
  unread?: boolean
  summary: {
    question: string
    confirmed: string | null
    guided: string | null
    unresolved: string | null
    staffCheck: string | null
  }
  messages: TicketMessage[]
}

// 담당(배정) 후보 = 문의함을 여는 역할만 = 접수직원·관리자.
// ⛔ 의사는 넣지 않는다 — 의사 사이드바엔 문의함이 없어(SHELL-NAV-03) 채팅을 하지 않는다(사용자 지시 2026-08-23).
export const ACTIVE_STAFF = [
  { id: 's1', name: '김서연', role: '관리자' },
  { id: 's2', name: '박지민', role: '접수직원' },
  { id: 's3', name: '최수빈', role: '접수직원' },
]

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: 'T-1042', status: 'pending', question: '내일 예약을 취소하고 싶어요',
    handoffReason: '예약 취소는 직원 확인이 필요합니다', createdAt: '2026-08-22T08:42:00', createdLabel: '오늘 08:42',
    assignee: null, reason: 'cancel_booking', bookingType: '취소 상담', bookingSummary: '8/23 10:30 · 내과 · 이정훈',
    summary: {
      question: '내일 내과 예약을 취소할 수 있는지 문의', confirmed: '본인 예약 · 8/23 10:30 · 내과',
      guided: '취소는 직원 확인 후 안내한다고 설명', unresolved: '취소 가능 여부와 후속 일정 확인 필요', staffCheck: '예약 상태 확인 후 환자에게 답변',
    },
    messages: [
      { id: 'm1', sender: '환자', text: '내일 오전 예약을 취소하고 싶어요.', time: '08:40' },
      { id: 'm2', sender: 'AI', text: '예약 취소는 직원 확인이 필요해 상담으로 연결해 드릴게요.', time: '08:41' },
      { id: 'm3', sender: '환자', text: '네, 확인 부탁드려요.', time: '08:42' },
    ],
  },
  {
    id: 'T-1045', status: 'pending', question: '혈압약을 오늘 한 번 더 먹어도 되나요?',
    handoffReason: '복약 관련 의료 판단이 필요합니다', createdAt: '2026-08-22T09:18:00', createdLabel: '오늘 09:18',
    assignee: null, reason: 'medical_judgment', unread: true,
    summary: {
      question: '혈압약 중복 복용 가능 여부', confirmed: '오늘 아침 복용 여부가 확실하지 않음', guided: '추가 복용 전 의료진 확인을 안내',
      unresolved: '현재 처방과 복용 여부 확인 필요', staffCheck: '담당 의사에게 확인한 뒤 복약 안내를 답변',
    },
    messages: [
      { id: 'm4', sender: '환자', text: '아침에 약을 먹었는지 기억이 안 나요. 한 번 더 먹어도 될까요?', time: '09:16' },
      { id: 'm5', sender: 'AI', text: '추가 복용 전에 의료진 확인이 필요합니다. 직원 상담으로 연결할게요.', time: '09:17' },
    ],
  },
  {
    id: 'T-1038', status: 'in_progress', question: '예약 시간을 오후로 바꿀 수 있나요?',
    handoffReason: '가능한 시간대 확인이 필요합니다', createdAt: '2026-08-22T08:10:00', createdLabel: '오늘 08:10',
    assignee: '박지민', reason: 'change_booking', bookingType: '변경 상담', bookingSummary: '8/24 09:00 · 정형외과 · 박강우',
    contactNote: '연락처 있음 · 문자 알림 가능', unread: true,
    summary: {
      question: '8/24 오전 예약을 같은 날 오후로 변경 희망', confirmed: '8/24 09:00 · 정형외과 · 박강우',
      guided: '직원이 가능한 시간대를 확인한다고 안내', unresolved: '오후 빈 시간 확인 필요', staffCheck: '오후 예약 가능 시간 제안',
    },
    messages: [
      { id: 'm6', sender: '환자', text: '24일 예약을 오후로 옮길 수 있을까요?', time: '08:08' },
      { id: 'm7', sender: 'AI', text: '가능한 시간 확인을 위해 직원 상담으로 연결해 드릴게요.', time: '08:09' },
      { id: 'm8', sender: '직원', text: '확인 중입니다. 잠시만 기다려 주세요.', time: '08:13' },
      { id: 'm9', sender: '환자', text: '오후 2시 이후면 좋습니다.', time: '08:21' },
    ],
  },
  {
    id: 'T-1031', status: 'answered', question: '주차 등록은 어디에서 하나요?',
    handoffReason: '방문 차량 등록 위치 문의', createdAt: '2026-08-21T16:04:00', createdLabel: '어제 16:04',
    assignee: '김서연', reason: 'general',
    summary: { question: '주차 등록 위치', confirmed: null, guided: '원무 창구 위치 안내', unresolved: null, staffCheck: null },
    messages: [
      { id: 'm10', sender: '환자', text: '주차 등록은 어디서 하나요?', time: '16:02' },
      { id: 'm11', sender: '직원', text: '1층 원무 창구에서 진료 후 등록해 드립니다.', time: '16:05' },
      { id: 'm12', sender: '직원', text: '상담이 종료되었습니다.', time: '16:06' },
    ],
  },
]

export function ticketsForStatus(tickets: Ticket[], status: TicketStatus): Ticket[] {
  return tickets
    .filter((ticket) => ticket.status === status)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
