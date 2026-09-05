import { apiFetch } from './httpClient'

// [MERGE-*] 중복 환자 병합 표시층의 얇은 클라이언트 — 경로·형태만 안다.
// 백엔드 계약: backend/app/routers/patient_merge.py (Task 21a, 둘 다 require_role("admin")).
// ⭐ 서버는 마스킹된 값만 내려보낸다(MASK-SRV-01) — 원본 전화·생일·UUID를 소비하지 않는다.
// ⭐ 읽음 체크는 화면의 이해 확인일 뿐 서버로 보내지 않는다(MERGE-CONFIRM-04) — merge 바디에 넣지 않는다.

/** 한 환자 행의 기록 건수(MERGE-COMPARE-02). 병합 전 낙관잠금 기준값이기도 하다(MERGE-RACE-01). */
export interface Counts {
  appointments: number
  questionnaires: number
  medical_records: number
  access_logs: number
}

/** GET /admin/merge-candidates 한 줄. is_primary는 서버가 미리 정하지 않는다(MERGE-LIST-01, null). */
export interface CandidateRow {
  patient_id: string
  name: string
  masked_birth_date: string
  masked_phone: string
  account_linked: boolean
  is_primary: boolean | null
  counts: Counts
  last_visit_at: string | null
}

export interface CandidateGroup {
  key: string
  rows: CandidateRow[]
}

/** POST 성공 응답 — 어느 병합인지(merge_id)와 계정 연결이 옮겨졌는지만(MERGE-UNDO-03). */
export interface MergeResult {
  merge_id: string
  account_link_moved: boolean
}

/** 낙관잠금 기준값(MERGE-RACE-01) — 서버 snapshot_counts와 같은 {primary, merged} 형태. */
export interface ExpectedCounts {
  primary: Counts
  merged: Counts
}

export interface MergeBody {
  primary_id: string
  duplicate_id: string
  expected_counts: ExpectedCounts
}

export const patientMergeApi = {
  candidates: () => apiFetch<CandidateGroup[]>('/admin/merge-candidates'),

  /** [MERGE-CONFIRM-04] 바디는 {primary_id, duplicate_id, expected_counts}뿐 — 읽음 체크는 안 보낸다. */
  merge: (body: MergeBody) =>
    apiFetch<MergeResult>('/admin/merge-candidates/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
