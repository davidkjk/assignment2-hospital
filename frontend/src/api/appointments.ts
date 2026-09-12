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

// [QUEUE-WALK-08e] 예약 없이 오신 분 — ⛔ 진료과 id를 보내지 않는다.
// 「예약의 진료과 = 담당의의 진료과」를 DB 트리거가 강제하므로 진료과는 고르는 값이 아니라
// **파생값**이고, 서버가 담당의에서 도출한다(전화예약 /appointments/phone과 같은 방식).
// visit_time은 직원이 「지난 시각」을 직접 적었을 때만 싣는다(`QUEUE-WALK-14b`) —
// 비우면 「지금」이고 그 시각은 서버가 찍는다(화면 시계를 믿지 않는다).
export interface CreateWalkinBody {
  patient_id: string
  doctor_id: string
  reason: string
  visit_time?: string | null
}

export function createWalkinAppointment(body: CreateWalkinBody) {
  return apiFetch<{ appointment_id: string }>('/appointments/walkin', jsonBody(body))
}

// [CHKIN-RESULT-01] 접수 조회가 결과 카드에 그릴 요약. 전화·생년월일은 서버가 아예 담지 않는다
// (요구사항 :81은 목록 마스킹, 접수엔 「이 사람이 이 예약이 맞나」만 필요 — MASK-SRV-01).
// updated_at은 도착 처리의 낙관적 잠금 열쇠다(CHKIN-RESULT-03).
export interface BookingLookupResult {
  appointment_id: string
  patient_name: string
  slot_at: string
  department_name: string
  doctor_name: string
  status: string
  updated_at: string
}

// [CHKIN-CODE-03] QR 디코드와 직접 입력이 함께 부른다. 만료·미존재·종료는 서버가 구분 없이 null.
// ⛔ 예약번호를 URL 쿼리·로그에 남기지 않는다(P-01) — 요청 경로 하나에만 싣는다.
export function findByCode(code: string) {
  return apiFetch<{ appointment: BookingLookupResult | null }>(
    `/appointments/find-by-code?code=${encodeURIComponent(code)}`,
  ).then((r) => r.appointment)
}

export function transitionStatus(
  appointmentId: string,
  body: { new_status: string; reason?: string | null; expected_updated_at: string },
) {
  return apiFetch<{ status: string }>(`/appointments/${appointmentId}/status`, patchBody(body))
}

/** [TODAY-YDAY-04] 전일 미완료 마감 — 사람이 판단한 결과(완료/취소)로 지난 날짜 예약을 닫는다. */
export function closeStaleAppointment(
  appointmentId: string,
  body: { outcome: 'completed' | 'cancelled'; expected_updated_at: string },
) {
  return apiFetch<{ status: string }>(`/appointments/${appointmentId}/close-stale`, jsonBody(body))
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
