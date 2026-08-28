import { apiFetch } from './httpClient'

// 의사 콘솔 전용 얇은 클라이언트 — 경로·형태만 안다(오류·오프라인·세션은 httpClient가 지킨다).
// 백엔드 계약: dashboard.py(get_doctor_queue) · appointments.py(change_status·undo_status).
// ⚠️ 기존 래퍼(dashboard.ts·appointments가 아직 없음)를 지우거나 이름 바꾸지 않는다 — 여기에 「추가」만 한다.

/** [DOCTOR-QUEUE-01] get_doctor_queue의 한 행. 서버 DTO 그대로(마스킹된 이름만·전화번호 없음). */
export interface DoctorQueueApiRow {
  id: string
  patient_id: string
  name: string
  queue_position: number | null
  waiting_started_at: string | null
  status: string
  /** ⏳ BLOCKED(갭 #36 경계): change_status가 요구하는 낙관적 잠금 값. get_doctor_queue가 아직
   *  주지 않아, 이 값 없이는 실제 진료중 전이 요청이 422로 거절된다. 서버가 담아 주면 그대로 흘려보낸다. */
  updated_at?: string
}

/** get_doctor_queue 응답 — mode는 날짜 모드(live=오늘 / read_only_with_record_edit=과거). */
export interface DoctorQueueResponse {
  rows: DoctorQueueApiRow[]
  mode: 'live' | 'read_only_with_record_edit'
}

export function getDoctorQueue(doctorId: string, date?: string) {
  const q = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiFetch<DoctorQueueResponse>(`/doctors/${doctorId}/queue${q}`)
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/**
 * [DOCTOR-START-01] 진료대기 → 진료중 자동 전이. ⚠️ 낙관적 잠금(expected_updated_at)이 필수라,
 * 큐 행이 updated_at을 담아 줄 때만 성공한다(그전엔 BLOCKED). 낙관적으로 화면을 먼저 바꾸지 않는다(P-07).
 */
export function transitionStatus(
  appointmentId: string,
  newStatus: string,
  expectedUpdatedAt: string,
) {
  return apiFetch<{ status: string }>(
    `/appointments/${appointmentId}/status`,
    json('PATCH', { new_status: newStatus, expected_updated_at: expectedUpdatedAt }),
  )
}

/** [DOCTOR-START-03][UNDO-*] 한 칸 되돌리기. 사유 필요 여부는 서버가 판정한다(reason_required). */
export interface UndoResult {
  executed: boolean
  reason_required: boolean
  from_status?: string
  status?: string
}

export function undoStatus(appointmentId: string, reason?: string) {
  return apiFetch<UndoResult>(
    `/appointments/${appointmentId}/undo`,
    json('POST', reason ? { reason } : {}),
  )
}
