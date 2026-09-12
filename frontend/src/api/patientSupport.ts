import { apiFetch } from './httpClient'

// 환자상세 상담 섹션(PTSUP-SECT)의 얇은 클라이언트 — 그 환자에게 넘어온 상담 티켓만.
// 백엔드 계약(Task 19 선언 → backend/app/routers/staff_chat.py):
//  - GET /staff/patients/{id}/support-tickets → thread 소유주로 조인, 최신순+id 동점키(PTDET-SUPPORT-03).
// ⭐ Task 2가 support_tickets 표와 안정 정렬을 이미 만들어 BLOCK-01 해소 — 가짜 카드가 아니라 실제 조회.

export type SupportStatus = 'pending' | 'in_progress' | 'answered'

/** 환자 범위 상담 티켓 — PTDET-SUPPORT 카드가 쓰는 값(질문·안내·이유·상태). */
export interface PatientTicket {
  id: string
  patientId: string
  question: string
  status: SupportStatus
  createdAt: string
  botAnswer?: string // 상담봇 안내(PTDET-SUPPORT-01)
  handoffReason?: string // 직원에게 넘어온 이유
}

interface PatientTicketDto {
  id: string
  patient_id: string
  question: string
  status: SupportStatus
  created_at: string
  bot_answer?: string | null
  handoff_reason?: string | null
}

function fromDto(d: PatientTicketDto): PatientTicket {
  return {
    id: d.id,
    patientId: d.patient_id,
    question: d.question,
    status: d.status,
    createdAt: d.created_at,
    botAnswer: d.bot_answer ?? undefined,
    handoffReason: d.handoff_reason ?? undefined,
  }
}

export interface PatientSupportApi {
  // 현재 환자 범위만 — 서버가 최신순+id 동점키로 준다. 프론트는 방어 정렬만 한다.
  listPatientTickets(patientId: string): Promise<PatientTicket[]>
}

export const patientSupportApi: PatientSupportApi = {
  async listPatientTickets(patientId) {
    const rows = await apiFetch<PatientTicketDto[]>(`/staff/patients/${patientId}/support-tickets`)
    return rows.map(fromDto)
  },
}
