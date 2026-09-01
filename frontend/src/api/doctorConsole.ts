import { apiFetch } from './httpClient'

// 의사 콘솔 전용 얇은 클라이언트 — 경로·형태만 안다(오류·오프라인·세션은 httpClient가 지킨다).
// 백엔드 계약: dashboard.py(get_doctor_queue) · appointments.py(change_status·undo_status).
// ⚠️ 기존 래퍼(dashboard.ts·appointments가 아직 없음)를 지우거나 이름 바꾸지 않는다 — 여기에 「추가」만 한다.

/** [DOCTOR-QUEUE-01] get_doctor_queue의 한 행. 서버 DTO 그대로(마스킹된 이름만·전화번호 없음). */
export interface DoctorQueueApiRow {
  id: string
  patient_id: string
  name: string
  /** [DOCTOR-QUEUE-02][MASK-SRV-01] 서버가 가려서 준 생년월일(1976-**-14). 화면이 다시 가리지 않는다. */
  masked_birth_date?: string | null
  /** [DOCTOR-QUEUE-02] 성별(남/여). */
  gender?: string | null
  queue_position: number | null
  /** [DOCTOR-QUEUE-03] 상태별 표시 순번 — 진료중=0·진료대기=1·2·3…·도착=null(순번 없음). */
  display_position: number | null
  /** [DOCTOR-QUEUE-02] 주의 표시 플래그(is_urgent_flag) — 화면이 「⚠️ 주의 표시」 텍스트로 낸다. */
  is_urgent?: boolean
  waiting_started_at: string | null
  /** [QUEUE-ROW-06] 현재 상태로 진입한 시각 — 상태별 라벨(경과/대기/분째)의 기준. */
  status_since: string | null
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

/** [DOCTOR-HISTORY-01] 콘솔 선택 환자의 완료 과거기록 한 행(현재 예약 제외·최신순). 서버 DTO 그대로. */
export interface ConsoleHistoryRow {
  id: string
  date: string | null
  department_name?: string | null
  doctor_name?: string | null
  diagnosis?: string | null
  status: string
}

/**
 * [DOCTOR-HISTORY-01] 선택 환자의 완료 과거 진료기록을 최신순으로. 현재 열어 둔 예약은 제외해
 * 「지금 쓰는 진료」와 참고용 과거를 섞지 않는다. care-continuity 범위는 서버(RLS)가 지킨다.
 */
export function getConsoleHistory(patientId: string, excludeAppointmentId?: string) {
  const q = excludeAppointmentId ? `?exclude_appointment_id=${encodeURIComponent(excludeAppointmentId)}` : ''
  return apiFetch<{ rows: ConsoleHistoryRow[] }>(`/doctors/console/patients/${patientId}/history${q}`)
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
