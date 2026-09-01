import { apiFetch, ApiError } from './httpClient'
import { TicketClaimConflict, type TicketStatus } from './staffChat'

// 티켓 상세(직원 채널)의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약: backend/app/routers/staff_chat.py · services/chat/ticket_service.py (마이그 00060: reassign·read)
//  - GET  /staff/chat/tickets/{id}          → 상세(요약 5항목+전체 대화+담당자+연락처 마스킹). 404/403 = 딥링크 방어.
//  - POST /staff/chat/tickets/{id}/claim    → 딥링크 자동 배정(409 = 경쟁 패자)
//  - POST /staff/chat/tickets/{id}/messages → 직원 답변(멱등 client_message_id). status 불변.
//  - POST /staff/chat/tickets/{id}/close    → answered(이때만)
//  - POST /staff/chat/tickets/{id}/reassign → assigned_staff_id만 변경·in_progress 유지
//  - POST /staff/chat/tickets/{id}/read     → 직원 읽음 커서 전진
//  - GET  /staff/active                     → 이관 대상(모든 활성 직원)

export type StaffRole = 'reception' | 'doctor' | 'admin'
export type Sender = 'patient' | 'ai' | 'staff' | 'system'

/** 인계 요약 5항목 — 값이 없으면 null(SUM-02: 지어내지 않음). */
export interface HandoffSummary {
  patientAsked: string | null
  botConfirmed: string | null
  alreadyGuided: string | null
  unresolvedReason: string | null
  staffShouldCheck: string | null
}

export interface ConvMessage {
  id: string
  sender: Sender
  body: string | null // 카드/시스템은 null 가능
  at: string
  patientRead: boolean // 직원 메시지를 환자가 읽었나(READ-01/02)
  staffUnread: boolean // 환자 메시지를 직원이 아직 확인 안 함(UNREAD-01/02)
  smsSent: boolean // 익명 웹 자리비움 문자 발송됨(NOTIFY-03)
}

/** 연락처는 절대 실제 전화번호를 담지 않는다(CONTACT-01): 마스킹 결과만. */
export interface Contact {
  anonymous: boolean
  hasPhone: boolean
}

export interface TicketDetail {
  id: string
  status: TicketStatus
  reason: string // 인계 이유 코드. 'medical_judgment'면 의료판단 전달 강조(REASSIGN-01)
  assignee: { name: string; role: StaffRole } | null
  isMine: boolean // 현재 직원이 담당자인가(OPEN-03)
  summary: HandoffSummary
  messages: ConvMessage[]
  contact: Contact
}

export interface ActiveStaff {
  id: string
  name: string
  role: StaffRole
}

/** 없는·권한 없는 티켓(404/403) — 딥링크 방어. 내용 없이 목록 복귀 경로(ERR-02). */
export class TicketNotFound extends Error {
  constructor(message = '문의를 찾을 수 없습니다.') {
    super(message)
    this.name = 'TicketNotFound'
  }
}

// ── 서버 응답(snake) → 카멜 매핑. 프론트 어디에도 snake가 새 나가지 않는다. ──
interface ConvMessageDto {
  id: string
  sender: Sender
  body: string | null
  at: string
  patient_read: boolean
  staff_unread: boolean
  sms_sent: boolean
}
interface TicketDetailDto {
  id: string
  status: TicketStatus
  reason: string
  assignee: { name: string; role: StaffRole } | null
  is_mine: boolean
  summary: {
    patient_asked: string | null
    bot_confirmed: string | null
    already_guided: string | null
    unresolved_reason: string | null
    staff_should_check: string | null
  }
  messages: ConvMessageDto[]
  contact: { anonymous: boolean; has_phone: boolean }
}
interface ActiveStaffDto {
  id: string
  name: string
  role: StaffRole
}

function msgFromDto(m: ConvMessageDto): ConvMessage {
  return {
    id: m.id,
    sender: m.sender,
    body: m.body,
    at: m.at,
    patientRead: m.patient_read,
    staffUnread: m.staff_unread,
    smsSent: m.sms_sent,
  }
}
function detailFromDto(d: TicketDetailDto): TicketDetail {
  return {
    id: d.id,
    status: d.status,
    reason: d.reason,
    assignee: d.assignee,
    isMine: d.is_mine,
    summary: {
      patientAsked: d.summary.patient_asked,
      botConfirmed: d.summary.bot_confirmed,
      alreadyGuided: d.summary.already_guided,
      unresolvedReason: d.summary.unresolved_reason,
      staffShouldCheck: d.summary.staff_should_check,
    },
    messages: d.messages.map(msgFromDto),
    contact: { anonymous: d.contact.anonymous, hasPhone: d.contact.has_phone },
  }
}

// 서버 오류를 화면이 가릴 수 있는 전용 예외로 승격한다(문장은 서버 것을 그대로 옮긴다 — ERR-MSG-01).
//   409 = 경쟁 패자·이관 불가 → TicketClaimConflict · 404/403 = 딥링크 방어 → TicketNotFound. 그 외는 그대로.
function raiseMapped(e: unknown): never {
  if (e instanceof ApiError) {
    if (e.status === 409) throw new TicketClaimConflict(e.message)
    if (e.status === 404 || e.status === 403) throw new TicketNotFound(e.message)
  }
  throw e
}
const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export interface StaffTicketDetailApi {
  getDetail(ticketId: string): Promise<TicketDetail>
  claim(ticketId: string): Promise<TicketDetail> // 딥링크 OPEN-01; 409→Conflict
  sendMessage(ticketId: string, body: string, requestId: string): Promise<ConvMessage> // 멱등
  closeTicket(ticketId: string): Promise<void> // → answered
  reassignTicket(ticketId: string, toStaffId: string): Promise<TicketDetail>
  markRead(ticketId: string, messageId: string): Promise<void>
  listActiveStaff(): Promise<ActiveStaff[]>
}

export const staffChatDetailApi: StaffTicketDetailApi = {
  async getDetail(ticketId) {
    try {
      return detailFromDto(await apiFetch<TicketDetailDto>(`/staff/chat/tickets/${ticketId}`))
    } catch (e) {
      raiseMapped(e)
    }
  },
  async claim(ticketId) {
    // 배정 성공/이미 내 것이면 최신 상세를 다시 받아 돌려준다(승자만 상세를 연다).
    try {
      await apiFetch(`/staff/chat/tickets/${ticketId}/claim`, { method: 'POST' })
    } catch (e) {
      raiseMapped(e)
    }
    return this.getDetail(ticketId)
  },
  async sendMessage(ticketId, body, requestId) {
    // ⚠️ 실제 라우트 계약은 {content, client_message_id} — 멱등 키는 client_message_id다(플랜의 request_id 아님).
    try {
      return msgFromDto(
        await apiFetch<ConvMessageDto>(
          `/staff/chat/tickets/${ticketId}/messages`,
          jsonPost({ content: body, client_message_id: requestId }),
        ),
      )
    } catch (e) {
      raiseMapped(e)
    }
  },
  async closeTicket(ticketId) {
    try {
      await apiFetch(`/staff/chat/tickets/${ticketId}/close`, { method: 'POST' })
    } catch (e) {
      raiseMapped(e)
    }
  },
  async reassignTicket(ticketId, toStaffId) {
    try {
      return detailFromDto(
        await apiFetch<TicketDetailDto>(
          `/staff/chat/tickets/${ticketId}/reassign`,
          jsonPost({ to_staff_id: toStaffId }),
        ),
      )
    } catch (e) {
      raiseMapped(e)
    }
  },
  async markRead(ticketId, messageId) {
    try {
      await apiFetch(`/staff/chat/tickets/${ticketId}/read`, jsonPost({ message_id: messageId }))
    } catch (e) {
      raiseMapped(e)
    }
  },
  async listActiveStaff() {
    try {
      return await apiFetch<ActiveStaffDto[]>(`/staff/active`)
    } catch (e) {
      raiseMapped(e)
    }
  },
}
