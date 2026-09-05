// 안내 보내기 가짜 데이터 (SEND-*) — 제1문 화면(/messages): 「예약해 둔 것 · 보낸 것」.
// 발송 결과를 진짜로 담는다(SEND-RESULT-*): 접수까지가 아니라 도달/실패까지.

export type Kind = '안내' | '광고'
export type Channel = '앱 알림 + 문자' | '앱 알림만' | '문자'
export type SendState = '도달' | '실패' | '발송 중' | '재시도 중'
export type FailReason = '없는 번호' | '문자 수신 차단' | '앱을 지웠고 문자도 실패'

export interface Recipient {
  name: string
  phone: string
  state: SendState
  failReason?: FailReason
}

export interface Message {
  id: string
  kind: Kind
  content: string
  staff: string // 보낸/예약한 직원 (SEND-ALL-05)
  channel: Channel
  at: string // 보낸 시각 또는 예약 발송 시각
  targetCount: number
  reached?: number
  failed?: number
  sending?: boolean // 아직 진행 중
  recipients?: Recipient[] // 「대상 N명」을 누르면 열리는 명단
}

// 이름·번호 가짜 명단 만들기
function makeRecipients(reached: number, fails: { reason: FailReason; n: number }[]): Recipient[] {
  const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
  const given = ['서연', '민준', '지우', '하은', '도윤', '수아', '예준', '지호', '유진', '건우']
  const out: Recipient[] = []
  let seed = 7
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const name = () => surnames[Math.floor(rnd() * 10)] + given[Math.floor(rnd() * 10)]
  const phone = () => `010-${String(1000 + Math.floor(rnd() * 8999))}-${String(1000 + Math.floor(rnd() * 8999))}`
  for (let i = 0; i < reached; i++) out.push({ name: name(), phone: phone(), state: '도달' })
  for (const f of fails) for (let i = 0; i < f.n; i++) out.push({ name: name(), phone: phone(), state: '실패', failReason: f.reason })
  return out
}

export const sentMessages: Message[] = [
  {
    id: 's1', kind: '안내', content: '8/25(월) 오전 진료 일정 변경 안내', staff: '김접수', channel: '앱 알림 + 문자',
    at: '8/22 09:14', targetCount: 86, reached: 84, failed: 2,
    recipients: makeRecipients(84, [{ reason: '문자 수신 차단', n: 1 }, { reason: '없는 번호', n: 1 }]),
  },
  {
    id: 's2', kind: '안내', content: '독감 예방접종 시작 안내', staff: '이관리', channel: '앱 알림 + 문자',
    at: '8/21 15:30', targetCount: 312, reached: 305, failed: 7,
    recipients: makeRecipients(305, [{ reason: '문자 수신 차단', n: 2 }, { reason: '앱을 지웠고 문자도 실패', n: 1 }, { reason: '없는 번호', n: 4 }]),
  },
  {
    id: 's3', kind: '광고', content: '(광고) 가을 건강검진 특별 할인', staff: '이관리', channel: '문자',
    at: '8/20 10:05', targetCount: 1240, reached: 1240, failed: 0,
  },
  {
    id: 's4', kind: '안내', content: '9/5(금) 오후 임시 휴진 안내', staff: '김접수', channel: '앱 알림 + 문자',
    at: '8/22 11:02', targetCount: 34, reached: 20, failed: 0, sending: true,
  },
]

export const scheduledMessages: Message[] = [
  { id: 'q1', kind: '안내', content: '추석 연휴 진료 안내', staff: '이관리', channel: '앱 알림 + 문자', at: '8/28 09:00 예약', targetCount: 3120 },
  { id: 'q2', kind: '광고', content: '(광고) 도수치료 가을 이벤트', staff: '이관리', channel: '문자', at: '8/25 10:00 예약', targetCount: 980 },
]

/** 자동 발송(전날/당일 알림·문진 안내 등) — 접어 두지만 펼치면 실제 목록을 보여준다 (SEND-LIST-08).
 *  오늘 누적은 autoSendCount(수십~수백 건), 아래는 최근분 표본. */
export const autoSendCount = 41
export const autoSendMessages: Message[] = [
  { id: 'auto1', kind: '안내', content: '내일 예약 안내 · 8/23(토) 내과 진료', staff: '시스템', channel: '앱 알림 + 문자', at: '8/22 18:00', targetCount: 47, reached: 46, failed: 1, recipients: makeRecipients(46, [{ reason: '없는 번호', n: 1 }]) },
  { id: 'auto2', kind: '안내', content: '오늘 예약 안내 · 8/22 14:30 정형외과', staff: '시스템', channel: '앱 알림만', at: '8/22 08:00', targetCount: 39, reached: 39, failed: 0 },
  { id: 'auto3', kind: '안내', content: '사전문진 작성 안내 · 방문 전 입력해 주세요', staff: '시스템', channel: '앱 알림 + 문자', at: '8/22 12:10', targetCount: 22, reached: 21, failed: 1, recipients: makeRecipients(21, [{ reason: '문자 수신 차단', n: 1 }]) },
  { id: 'auto4', kind: '안내', content: '예약이 확정되었습니다 · 8/26(화) 11:00 이비인후과', staff: '시스템', channel: '앱 알림 + 문자', at: '8/22 10:42', targetCount: 8, reached: 8, failed: 0 },
  { id: 'auto5', kind: '안내', content: '예약 취소 처리 안내', staff: '시스템', channel: '앱 알림만', at: '8/21 16:20', targetCount: 3, reached: 3, failed: 0 },
]

/** 새로 보내기 — 받는 사람 검색 가짜 결과 */
export const patientSearchResults = [
  { id: 'p1', name: '강동훈', phone: '010-2211-4590' },
  { id: 'p2', name: '문소희', phone: '010-8842-3301' },
  { id: 'p3', name: '조은비', phone: '010-5567-9910' },
]
