export type MessageKind = '안내' | '광고'
export type DeliveryResult = '도달' | '실패' | '발송 중' | '재시도 중'

export interface MessageRecipient {
  id: string
  name: string
  phone: string
  result: DeliveryResult
}

export interface MessageLog {
  id: string
  kind: MessageKind
  content: string
  staff: string
  channel: string
  at: string
  targetCount: number
  result: string
  recipients: MessageRecipient[]
}

const recipients: MessageRecipient[] = [
  { id: 'p1', name: '김태호', phone: '010-4821-9930', result: '도달' },
  { id: 'p2', name: '이말녀', phone: '010-2841-1043', result: '도달' },
  { id: 'p3', name: '한지아', phone: '010-3092-7788', result: '재시도 중' },
  { id: 'p4', name: '정순남', phone: '010-5521-8834', result: '실패' },
]

export const scheduledMessages: MessageLog[] = [
  {
    id: 's1',
    kind: '안내',
    content: '8월 24일 오전 진료는 병원 사정으로 10시에 시작합니다.',
    staff: '박지민',
    channel: '앱 알림 + 문자 보완',
    at: '8/23 18:00',
    targetCount: 12,
    result: '예약됨',
    recipients,
  },
]

export const sentMessages: MessageLog[] = [
  {
    id: 'm1',
    kind: '안내',
    content: '오늘 주차장 입구 공사로 정문 옆 지하 주차장을 이용해 주세요.',
    staff: '박지민',
    channel: '앱 알림 + 문자 보완',
    at: '오늘 08:12',
    targetCount: 34,
    result: '도달 32건 · 실패 2건',
    recipients,
  },
  {
    id: 'm2',
    kind: '안내',
    content: '정형외과 진료시간 변경으로 예약 시간을 확인해 주세요.',
    staff: '김서연',
    channel: '모두에게 문자도',
    at: '8/21 16:40',
    targetCount: 8,
    result: '도달 8건',
    recipients: recipients.slice(0, 3).map((recipient) => ({ ...recipient, result: '도달' })),
  },
]

export const automaticMessages: MessageLog[] = [
  {
    id: 'auto1',
    kind: '안내',
    content: '내일 예약 알림',
    staff: '자동 발송',
    channel: '앱 알림 + 문자 보완',
    at: '오늘 08:00',
    targetCount: 41,
    result: '도달 41건',
    recipients,
  },
]

export const messagePatients = [
  { id: 'p1', name: '김태호', birth: '1972-11-03', phone: '010-4821-9930' },
  { id: 'p2', name: '이말녀', birth: '1955-08-17', phone: '010-2841-1043' },
  { id: 'p3', name: '한지아', birth: '1995-01-19', phone: '010-3092-7788' },
]
