import { apiFetch } from './httpClient'

// 환자 도메인 얇은 클라이언트.
// ⚠️ 백엔드 라우터(backend/app/routers/patients.py)는 Task 6에서 처음 생긴다 —
//    경로는 Task 6 플랜의 계약(`GET /patients?q=` · `GET /patients/{id}` · `GET /patients/{id}/contact`)에 맞춘다.
//    전화번호 펼치기는 열람 기록이 남는 별도 창구(`/contact`)라, 목록·상세와 나눠 부른다(MASK-*·SEARCH-LOG-*).

// ⭐ 전역 환자 검색의 단일 창구(SEARCH-BOX-03) — /patients 화면과 워크인·전화예약 패널이 같은 걸 부른다.
//    24a(백엔드)가 못박은 계약을 그대로 소비한다: 한 칸(q) + 커서(cursor), 응답은 마스킹된 줄 + 커서.
//    ⛔ 원본(전화·생일 전체)은 응답에 오지 않는다 — 서버가 masked_* 로만 내려준다(MASK-SRV-01).

/** 왜 걸렸는지(SEARCH-WHY-01·03) — 조각별로 이름·전화·생일 중 무엇이 맞았나. */
export type SearchMatch = 'name' | 'phone' | 'birth'

/** 오늘 상태(SEARCH-ACT-*) — /queue와 같은 순간의 값을 서버가 준다. 화면이 다시 계산하지 않는다. */
export type SearchTodayStatus = 'booked' | 'arrived' | 'done' | null

/** 검색 결과 한 줄 — 마스킹된 표시값만. 24a 계약(patient_row_dto + matched·오늘상태). */
export interface SearchPatientRow {
  patient_id: string
  name: string
  masked_phone: string
  masked_birth_date: string
  gender: string | null
  matched: SearchMatch[]
  today_status: SearchTodayStatus
  /** "HH:MM" — 오늘 예약이 있을 때만. 맨 위에 있는 이유를 그 줄에 싣는다(SEARCH-ORDER-06). */
  today_appointment_time: string | null
  /** 오늘 예약의 진료과·의사 표시명 — 예약이 있을 때만(접수에 필요한 정보, SEARCH-ORDER-06). */
  today_department_name: string | null
  today_doctor_name: string | null
}

/** 커서로 이어받는 한 페이지(SEARCH-RESULT-02·03) — 20건·안정 동점키는 서버(paginate)가 소유. */
export interface SearchPatientsPage {
  rows: SearchPatientRow[]
  next_cursor: string | null
  has_more: boolean
}

export function searchPatients(query: string, cursor?: string | null) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (cursor) params.set('cursor', cursor)
  const qs = params.toString()
  return apiFetch<SearchPatientsPage>(`/patients${qs ? `?${qs}` : ''}`)
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
  /** [SEND-DEAD-01] 이 번호로 문자가 가지 않음(00014 patients.sms_dead). */
  sms_dead?: boolean | null
  /** [SEND-DEAD-01] 문자 죽음 확인 시각(00014 patients.sms_dead_checked_at). */
  sms_dead_checked_at?: string | null
}

/** 마스킹된 이력 한 행 — 방문·진료기록 공통(patient_row_dto). */
export interface PatientHistoryRow {
  patient_id: string
  name?: string
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
  // [PTDET-QNR-03 A안] 이 예약의 사전문진 제출 시각 — 있으면 작성완료, null/없으면 미작성.
  //   '작성 여부'만 온다(답변 내용은 담당 의사 전용, :420·#14). 서버: questionnaire_submitted_at_for(00076).
  questionnaire_submitted_at?: string | null
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

/** [PTDET-ACTION-02][갭 #19·결정 #4 ㉯] 새 번호로 인증번호를 보낸다 — 그 번호에 닿는 사람만 바꾼다. */
export function requestPhoneChange(patientId: string, newPhone: string) {
  return apiFetch<{ ok: boolean }>(`/patients/${patientId}/phone-change/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_phone: newPhone }),
  })
}

/** [PTDET-ACTION-02·03][결정 #4 ⓑ] 인증번호가 맞아야 번호가 바뀐다 — 실패하면 기존 번호가 산다. */
export function confirmPhoneChange(patientId: string, newPhone: string, code: string) {
  return apiFetch<{ ok: boolean }>(`/patients/${patientId}/phone-change/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_phone: newPhone, code }),
  })
}

/** 예외 진입 자격을 서버가 다시 판정한다(PTDET-FAMILY-04·05) — 화면이 정하지 않는다. */
export function verifyFamilyEligibility(patientId: string, memberId: string) {
  return apiFetch<{ allowed: boolean; message: string }>(
    `/patients/${patientId}/family/${memberId}/verify-eligibility`,
    { method: 'POST' },
  )
}
