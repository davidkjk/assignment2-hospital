import { apiFetch, ApiError } from './httpClient'

// 상담봇 문의함(직원 채널)의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약: backend/app/routers/staff_chat.py · backend/app/services/chat/ticket_service.py
//  - GET  /staff/chat/tickets?status=  → 접수순(created_at ASC, id ASC) 목록 (idx_tickets_queue)
//  - POST /staff/chat/tickets/{id}/claim → 원자 배정(서버가 승패). 경쟁 패자 = 409.

export type TicketStatus = 'pending' | 'in_progress' | 'answered'
// 예약 상담 유형(cancel/reschedule)·의료판단·일반. 서버가 handoff 사유+예약 유무로 판정한다.
export type RequestType = 'cancel' | 'reschedule' | 'medical_judgment' | 'general' | null

/** 행·상세 공용 티켓 모양(카멜) — 서버 snake_case를 여기서 한 번만 옮긴다. */
export interface InboxTicket {
  id: string
  status: TicketStatus
  patientQuestion: string // 환자 질문(인계 요약의 대표 한 줄)
  handoffReason: string // 인계 이유
  createdAt: string // 접수시각(정렬 키)
  assigneeName: string | null // 현재 담당자 이름(미배정이면 null → "미배정")
  requestType: RequestType // 예약 상담이면 cancel/reschedule
  appointmentSummary: string | null // 예약 상담이면 짧은 예약 요약
}

/** 서버 응답(snake_case) — 매핑 전 원형. 프론트 어디에도 새 나가지 않는다. */
interface InboxTicketDto {
  id: string
  status: TicketStatus
  patient_question: string
  handoff_reason: string
  created_at: string
  assignee_name: string | null
  request_type: RequestType
  appointment_summary: string | null
}

function fromDto(d: InboxTicketDto): InboxTicket {
  return {
    id: d.id,
    status: d.status,
    patientQuestion: d.patient_question,
    handoffReason: d.handoff_reason,
    createdAt: d.created_at,
    assigneeName: d.assignee_name,
    requestType: d.request_type,
    appointmentSummary: d.appointment_summary,
  }
}

/** 경쟁 패자(409) — 화면이 `이미 다른 직원이 맡았어요`로 바꾸고 최신 담당자를 재조회한다. */
export class TicketClaimConflict extends Error {
  constructor(message = '이미 다른 직원이 맡았어요.') {
    super(message)
    this.name = 'TicketClaimConflict'
  }
}

export interface StaffChatApi {
  // 서버가 접수순(created_at ASC, id ASC)으로 준다. 프론트는 재정렬하지 않는다(방어 정렬만).
  listTickets(status: TicketStatus): Promise<InboxTicket[]>
  // 성공 = 내가 맡은 티켓(in_progress). 409 = 경쟁 패자 → TicketClaimConflict.
  claimTicket(ticketId: string): Promise<InboxTicket>
}

/** 실 구현 — httpClient(apiFetch)로 서버 문장·401·오프라인을 그대로 지킨다. */
export const staffChatApi: StaffChatApi = {
  async listTickets(status) {
    const rows = await apiFetch<InboxTicketDto[]>(`/staff/chat/tickets?status=${status}`)
    return rows.map(fromDto)
  },
  async claimTicket(ticketId) {
    try {
      const row = await apiFetch<InboxTicketDto>(`/staff/chat/tickets/${ticketId}/claim`, { method: 'POST' })
      return fromDto(row)
    } catch (e) {
      // 서버 409(경쟁 패자·이미 맡음 실패)만 전용 예외로 승격 — 문장은 서버 것을 그대로 옮긴다(ERR-MSG-01).
      if (e instanceof ApiError && e.status === 409) throw new TicketClaimConflict(e.message)
      throw e
    }
  },
}
