import { apiFetch } from './httpClient'

// 직원 오답 신고(BADRPT-FORM)의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약: backend/app/routers/staff_chat.py · backend/app/services/chat/answer_feedback_service.py
//  - GET  /staff/chat/messages/{id}  → 신고 대상 봇 메시지(역할·본문). 봇 답변이 아니면 role로 드러난다(TARGET-02).
//  - POST /staff/chat/feedback       → answer_feedback(source=realtime_report). 저장만으로 반영되지 않는다(B3).
// ⭐ source 문자열은 `realtime_report`가 정본(C3-3, 2026-08-20) — 품질 리포트의 교정(quality_review)과 출처를 구분한다.

export type BadReportSource = 'realtime_report' | 'quality_review'
export type TargetRole = 'bot' | 'user' | 'staff' | 'system'

export interface TargetMessage {
  id: string
  role: TargetRole
  content: string
}

export interface BadReportInput {
  messageId: string
  correctionText: string
  addToExampleBank: boolean
}

export interface BadReportApi {
  getTargetMessage(messageId: string): Promise<TargetMessage>
  reportBadAnswer(d: BadReportInput): Promise<{ id: string }>
}

interface TargetMessageDto {
  id: string
  role: TargetRole
  content: string | null
}

/** 실 구현 — httpClient(apiFetch)로 서버 문장·401·오프라인을 그대로 지킨다. */
export const badReportApi: BadReportApi = {
  async getTargetMessage(messageId) {
    const d = await apiFetch<TargetMessageDto>(`/staff/chat/messages/${messageId}`)
    return { id: d.id, role: d.role, content: d.content ?? '' }
  },
  async reportBadAnswer(d) {
    return apiFetch<{ id: string }>(`/staff/chat/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: d.messageId,
        correction_text: d.correctionText,
        add_to_example_bank: d.addToExampleBank,
        source: 'realtime_report' satisfies BadReportSource,
      }),
    })
  },
}
