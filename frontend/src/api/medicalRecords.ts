import { apiFetch } from './httpClient'

// 진료기록 도메인 얇은 클라이언트. 백엔드 계약: backend/app/routers/medical_records.py

export interface DraftBody {
  appointment_id: string
  symptoms?: string | null
  diagnosis?: string | null
  treatment?: string | null
  patient_visible_notes?: string | null
}

export interface ReviseBody {
  symptoms?: string | null
  diagnosis?: string | null
  treatment?: string | null
  patient_visible_notes?: string | null
  reason: string
  expected_updated_at: string
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function saveDraft(body: DraftBody) {
  // updated_at = 방금 만든 초안의 잠금 기준 시각 — 완료가 그대로 써야 409를 안 낸다(L59).
  return apiFetch<{ record_id: string; updated_at: string }>('/medical-records/draft', json('POST', body))
}

export function completeRecord(recordId: string, body: { expected_updated_at: string }) {
  return apiFetch<{ status: string }>(`/medical-records/${recordId}/complete`, json('PATCH', body))
}

export function reviseRecord(recordId: string, body: ReviseBody) {
  return apiFetch<{ status: string }>(`/medical-records/${recordId}/revise`, json('PATCH', body))
}

export function getRecordByAppointment(appointmentId: string) {
  return apiFetch<Record<string, unknown>>(`/medical-records/by-appointment/${appointmentId}`)
}

export function listRevisions(recordId: string) {
  return apiFetch<Array<Record<string, unknown>>>(`/medical-records/${recordId}/revisions`)
}
