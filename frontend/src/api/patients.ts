import { apiFetch } from './httpClient'

// 환자 도메인 얇은 클라이언트.
// ⚠️ 백엔드 라우터(backend/app/routers/patients.py)는 Task 6에서 처음 생긴다 —
//    경로는 Task 6 플랜의 계약(`GET /patients?q=` · `GET /patients/{id}` · `GET /patients/{id}/contact`)에 맞춘다.
//    전화번호 펼치기는 열람 기록이 남는 별도 창구(`/contact`)라, 목록·상세와 나눠 부른다(MASK-*·SEARCH-LOG-*).

export function searchPatients(query: string) {
  return apiFetch<Array<Record<string, unknown>>>(`/patients?q=${encodeURIComponent(query)}`)
}

export function getPatient(patientId: string) {
  return apiFetch<Record<string, unknown>>(`/patients/${patientId}`)
}

// 마스킹된 번호를 펼친다 — 서버가 열람 기록을 남기는 창구(갭 #35).
export function revealContact(patientId: string) {
  return apiFetch<Record<string, unknown>>(`/patients/${patientId}/contact`)
}

// ── 환자 상세 하위 이력 (PTDET-*) ────────────────────────────────────────────
// 백엔드 계약: backend/app/routers/dashboard.py · patient_history_service.
// ⭐ 섹션마다 독립적으로 부른다(PTDET-LOAD-02) — 하나의 Promise.all로 묶지 않는다.
//    한 섹션이 403이어도 나머지가 무너지지 않게, 소비 화면이 쿼리를 나눠 건다.

/** 상세 헤더 데이터 — 목록이 아니므로 원본(전체)로 온다(MASK-DETAIL-01). */
export interface PatientDetail {
  id: string
  name: string
  birth_date: string
  gender: string | null
  phone: string | null
  /** 문자 실패/확인 시각(SEND-DEAD-01) — BLOCKED(갭 #123), 서버가 아직 주지 않는다. */
  sms_failed_at?: string | null
}

/** 마스킹된 이력 한 행 — 방문·진료기록 공통(patient_row_dto). */
export interface PatientHistoryRow {
  patient_id: string
  masked_name?: string
  masked_birth_date?: string
  masked_phone?: string
  id: string
  occurred_at: string
  status?: string
  diagnosis?: string | null
  is_completed?: boolean
  relation?: string
  // 진료과·담당 의사 — 서버 방문 응답이 아직 담지 않는다(BLOCKED). 오면 그대로 그린다.
  department_name?: string | null
  doctor_name?: string | null
}

/** 공용 커서 페이지(core.pagination) — 방문·진료기록이 같은 형태로 온다. */
export interface HistoryPage {
  rows: PatientHistoryRow[]
  next_cursor: string | null
  has_more: boolean
}

export function getPatientDetail(patientId: string) {
  return apiFetch<PatientDetail>(`/patients/${patientId}`)
}

export function getPatientVisits(patientId: string, cursor?: string | null) {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiFetch<HistoryPage>(`/patients/${patientId}/visits${q}`)
}

export function getPatientMedicalRecords(patientId: string, cursor?: string | null) {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiFetch<HistoryPage>(`/patients/${patientId}/medical-records${q}`)
}

export function getPatientFamily(patientId: string) {
  return apiFetch<PatientHistoryRow[]>(`/patients/${patientId}/family`)
}

/** 내부 메모 한 줄 — 직원이 쓴 글이라 마스킹을 거치지 않는다(PTDET-NOTE-01). */
export interface PatientNote {
  id: string
  content: string
  created_at: string
  staff_name: string
}

export function getPatientNotes(patientId: string) {
  return apiFetch<PatientNote[]>(`/patients/${patientId}/notes`)
}

export function addPatientNote(patientId: string, content: string) {
  return apiFetch<{ id: string }>(`/patients/${patientId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
}

/** 사전문진 응답 — 담당 의사만 answers를 받는다(PTDET-QNR-03·RLS). */
export interface Questionnaire {
  appointment_id: string
  template_id: string
  answers: Record<string, unknown>
  submitted_at: string | null
}

export function getQuestionnaire(appointmentId: string) {
  return apiFetch<{ questionnaire: Questionnaire | null }>(
    `/appointments/${appointmentId}/questionnaire`,
  )
}

/** 예외 진입 자격을 서버가 다시 판정한다(PTDET-FAMILY-04·05) — 화면이 정하지 않는다. */
export function verifyFamilyEligibility(patientId: string, memberId: string) {
  return apiFetch<{ allowed: boolean; message: string }>(
    `/patients/${patientId}/family/${memberId}/verify-eligibility`,
    { method: 'POST' },
  )
}
