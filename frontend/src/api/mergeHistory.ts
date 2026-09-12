import { apiFetch } from './httpClient'

// 병합 되돌림 이력 도메인 얇은 클라이언트 (`MHIST-*`).
// 백엔드 계약은 Task 26a(커밋 a5abd47)가 못박았다:
//   GET  /admin/merge-history?cursor=      → 커서 페이지(rows·has_more·next_cursor·order)
//   GET  /admin/merge-history/{id}         → 이벤트 상세(보존 스냅샷·되돌림 상태·잠김 사유)
//   POST /admin/merge-history/{id}/undo    → 되돌림 실행({reason, expected_status})
// ⛔ 원본 이름은 마스킹된 표시값(name)으로만 온다 — 화면이 다시 계산하지 않는다(MASK-SRV-01).

/** 서버가 판정한 되돌림 상태. 화면은 이 값을 배지·분기의 단일 근거로 쓴다(`MHIST-LIST-02`·`DETAIL-03`). */
export type MergeUndoStatus = 'undoable' | 'undone' | 'locked'

/** 배지 문구 매핑 — 상태 문자열을 화면 문구로. 26a 계약과 일치시킨다. */
export function statusBadge(status: MergeUndoStatus): string {
  if (status === 'undone') return '되돌림 완료'
  if (status === 'locked') return '되돌림불가'
  return '되돌림 가능'
}

/** 목록·상세가 함께 쓰는 마스킹된 환자 표시값. */
export interface MergeParty {
  patient_id?: string
  name: string
}

/** 목록 한 행(`MHIST-LIST-01`) — 즉시 되돌림 버튼은 두지 않는다. */
export interface MergeHistoryRow {
  id: string
  merge_event_id: string
  merged_at: string
  executed_by: string
  status: MergeUndoStatus
  primary: MergeParty
  merged: MergeParty
}

/** 커서로 이어받는 한 페이지(`MHIST-LIST-03`) — 20건·안정 동점키는 서버가 소유. */
export interface MergeHistoryPage {
  rows: MergeHistoryRow[]
  has_more: boolean
  next_cursor: string | null
  order?: string
}

/** 병합으로 지워지지 않은 원본 레코드 건수(`MHIST-DETAIL-02`). */
export interface MergePreservation {
  primary: Record<string, number>
  merged: {
    appointments: number
    questionnaires: number
    medical_records: number
    access_logs: number
  }
  lineage_active: boolean
}

/** 이벤트 상세(`MHIST-DETAIL-01·02`). */
export interface MergeEventData {
  merge_event_id: string
  merged_at: string
  executed_by: string
  undo_status: MergeUndoStatus
  lock_reason: string | null
  preservation: MergePreservation
  primary: MergeParty
  merged: MergeParty
}

/** 되돌림 결과(`MHIST-CONFIRM-03`). */
export interface UndoResult {
  status: 'undone'
  merge_event_id: string
}

export function getMergeHistory(cursor?: string | null) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return apiFetch<MergeHistoryPage>(`/admin/merge-history${qs}`)
}

export function getMergeEvent(mergeEventId: string) {
  return apiFetch<MergeEventData>(`/admin/merge-history/${mergeEventId}`)
}

/**
 * 되돌림 실행 — 낙관잠금 기준값(`expected_status`)을 실어 보낸다(`MERGE-RACE-01`).
 * 서버가 지금 상태와 다르면 409(이미 되돌림/잠김), 세션 만료는 온라인 401.
 * ⭐ 새 병합 이벤트를 만들지 않는다 — 선택한 merge_event_id를 그대로 되돌린다(`MHIST-REASON-02`).
 */
export function undoMerge(
  mergeEventId: string,
  input: { reason: string; expected_status: MergeUndoStatus },
) {
  return apiFetch<UndoResult>(`/admin/merge-history/${mergeEventId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/**
 * 잠김 이벤트의 감사메모를 대상 환자 내부 메모로 남긴다(`MHIST-LOCK-02·03`).
 * ⛔ 되돌림 성공이 아니라 운영 참고다. 병합 이벤트·잠김 사유·검토 사유를 본문에 담는다.
 */
export function saveMergeAuditNote(patientId: string, body: string) {
  return apiFetch<{ id: string }>(`/patients/${patientId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
}
