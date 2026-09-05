import { apiFetch } from './httpClient'

// [Task 28][SEND-*][MSGX-*] /messages 발송 만들기의 얇은 클라이언트 — 경로·형태만 안다.
// 백엔드 계약: backend/app/routers/messages.py
//   GET /messages · POST /messages · DELETE /messages/scheduled/{id}
// ⛔ 실제 배달·발송 결과·재시도·명단 열람은 Task 30 — 이 모듈은 만들기까지만 안다.

/** 화면 종류값(SEND-KIND). 저장값(transactional/marketing)은 서버가 매핑한다. */
export type MessageKind = 'transactional' | 'marketing'
/** 보내는 방법(SEND-CH-01). push_sms=앱+문자폴백(기본) / push=앱만 / sms=모두 문자. */
export type MessageChannel = 'push_sms' | 'push' | 'sms'

/** 예약해 둔 발송 한 줄(SEND-LIST-01 위 구역). */
export interface ScheduledRow {
  id: string
  kind: MessageKind
  body: string | null
  channel: string | null
  scheduled_at: string
  target_count: number | null
  status: string
}

/** 배치별 상태 집계(SEND-RESULT-05·12). 한 번의 발송(대상 N명)의 상태 넷을 센 것. */
export interface SendResultCounts {
  발송중: number
  도달: number
  재시도중: number
  실패: number
}

/** 보낸 발송 한 줄(SEND-LIST-06 = 한 배치). 발송 결과는 result 집계로 온다(Task 30). */
export interface SentRow {
  id: string
  kind: MessageKind
  body: string | null
  channel: string
  /** [SEND-RESULT-09] 사용자가 고른 원래 3값(push_sms/push/sms). */
  requested_channel: string | null
  sender_staff_id: string | null
  target_count: number | null
  sent_at: string
  /** [SEND-RESULT-12] 배치별 상태 건수. */
  result: SendResultCounts
}

/** [SEND-FAIL-07] 안 닿은 한 사람 — 이름·(마스킹된)번호·왜 안 갔나. */
export interface FailedItem {
  id: string
  /** [SEND-FAIL-08] '번호 고쳐야 함' 탭의 [환자 열기]가 /patients/:id 로 갈 목적지. */
  patient_id: string | null
  name: string
  phone: string
  failure_code: string | null
  notification_type: string
  /** [SEND-FAIL-09] 지난 발송에서 이미 실패한 번호(접어둔다). */
  already_known: boolean
}

/** [SEND-FAIL-02] 안 닿은 명단 두 무리 — 지금 전화 / 번호 고쳐야 함. */
export interface FailedList {
  call_now: FailedItem[]
  fix_number: FailedItem[]
}

export interface SentPage {
  rows: SentRow[]
  has_more: boolean
  next_cursor: string | null
  order: string[]
}

/** GET /messages — 예약/보낸 두 구역 + 자동 발송 건수(SEND-LIST-01·02·08). */
export interface MessagesView {
  scheduled: ScheduledRow[]
  sent: SentPage
  auto_count: number
}

/** POST /messages 응답(EnqueueResult). 야간 광고 차단이면 night_blocked+suggested_at. */
export interface EnqueueResult {
  target_count: number
  sms_count: number | null
  marketing_excluded: number
  notification_ids: string[] | null
  scheduled_id: string | null
  night_blocked: boolean
  suggested_at: string | null
}

export type RecipientsSpec = { patient_ids: string[] } | { all: true }

export interface SendInput {
  kind: MessageKind
  recipients_spec: RecipientsSpec
  channel: MessageChannel
  body: string
  /** [SEND-LATER-01][MSGX-SCHED-01] 예약 발송 시각(ISO8601, KST). 없으면 즉시. */
  scheduled_at?: string | null
}

export function getMessages(cursor?: string | null): Promise<MessagesView> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiFetch<MessagesView>(`/messages${qs}`)
}

export function sendMessage(input: SendInput): Promise<EnqueueResult> {
  return apiFetch<EnqueueResult>('/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** [MSGX-SCHED-02] pending 예약만 취소. 서버가 이미 종료된 예약을 409로 막는다. */
export function cancelScheduled(scheduledId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/messages/scheduled/${scheduledId}`, {
    method: 'DELETE',
  })
}

/** [SEND-FAIL-01] 한 배치의 안 닿은 명단(두 무리). batchId = 보낸 줄의 id. */
export function getFailedList(batchId: string): Promise<FailedList> {
  return apiFetch<FailedList>(`/messages/${batchId}/failed`)
}

/** [SEND-BADGE-01] 사이드바 숫자 — 전화해야 할 미처리 실패 건수. */
export function getBadgeCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/messages/badge-count')
}

/** [SEND-BADGE-06] 처리 표시로 배지를 줄인다. */
export function markHandled(notificationId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/messages/${notificationId}/mark-handled`, {
    method: 'POST',
  })
}
