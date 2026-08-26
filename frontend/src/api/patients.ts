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
