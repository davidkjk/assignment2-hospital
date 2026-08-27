import { apiFetch } from './httpClient'

// 예약 도메인의 얇은 클라이언트 — 경로·본문만 안다. 오류·오프라인·세션은 httpClient가 이미 지킨다.
// 백엔드 계약: backend/app/routers/appointments.py

export interface CreateAppointmentBody {
  account_patient_id: string
  for_patient_id: string
  department_id: string
  doctor_id: string
  reason: string
  // 서버가 "staff"로 고정하지만(구 클라이언트 호환 필드) 계약상 함께 보낸다.
  source: string
  initial_status: string
  slot_id?: string | null
  // 워크인 실제 방문 시각(QUEUE-WALK-18, 갭 #85). 슬롯 없는 당일 방문에만 보낸다. ISO 문자열.
  walkin_visit_time?: string | null
}

const jsonBody = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const patchBody = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function createAppointment(body: CreateAppointmentBody) {
  return apiFetch<{ appointment_id: string }>('/appointments', jsonBody(body))
}

export function transitionStatus(
  appointmentId: string,
  body: { new_status: string; reason?: string | null; expected_updated_at: string },
) {
  return apiFetch<{ status: string }>(`/appointments/${appointmentId}/status`, patchBody(body))
}

export function reorderQueue(
  appointmentId: string,
  body: { new_position: number; reason: string },
) {
  return apiFetch<{ status: string }>(`/appointments/${appointmentId}/queue-position`, patchBody(body))
}

export function setUrgentFlag(
  appointmentId: string,
  body: { is_urgent: boolean; expected_updated_at: string },
) {
  return apiFetch<{ status: string }>(`/appointments/${appointmentId}/urgent-flag`, patchBody(body))
}
