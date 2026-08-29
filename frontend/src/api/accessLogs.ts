import { apiFetch } from './httpClient'

// [ALOG-*] 환자정보 열람 기록(/admin/access-logs)의 얇은 클라이언트 — 경로·형태만 안다.
// 오류·오프라인(status 0)·세션 만료(온라인 401)는 httpClient가 지킨다.
// 백엔드 계약: backend/app/services/audit_query_service.py · routers/audit_logs.py
//
// ⚠️ 마스킹은 서버가 한다(MASK-SRV-01) — 환자 식별은 masked_* 로만 온다. 원본 name·phone·
//    birth_date는 응답에 아예 담기지 않는다. resource_type은 raw 문자열이라 배지·미래값 라벨·
//    대량 묶음 접기는 표시층이 한다(ALOG-LIST-07·ALOG-GROUP-01).

/** 한 열람 행의 환자 식별 — 서버가 마스킹한 값만(patient_row_dto 화이트리스트). */
export interface AccessLogPatientRef {
  patient_id: string
  name?: string
  masked_birth_date?: string
  masked_phone?: string
}

/** 한 열람 행 — 검색·통계처럼 환자 1명이 아닌 사건은 patient=null(SEARCH-LOG-02·STAT-AUDIT-02). */
export interface AccessLogRow {
  id: string
  /** 서버 절대 시각(ISO8601). 상대값으로 바꾸지 않는다(ALOG-LIST-02). */
  accessed_at: string
  /** raw 종류 문자열 — 좁히지 않고 그대로 온다. 표시층이 배지·미래값 라벨을 붙인다. */
  resource_type: string
  /** 검색 사건의 검색어(SEARCH-LOG). 결과 환자 목록은 남기지 않는다. */
  search_term: string | null
  /** 「넓은 검색」 여부(SEARCH-LOG-06) — 조각 하나로 기준(관리자 설정) 이상 조회. 표시층이 ⚠ 배지를 단다. */
  is_wide_search?: boolean
  /** 이름 없는·탈퇴 직원이면 null — 표시층이 「직원 정보 없음」으로 받는다(ALOG-LIST-03). */
  staff_name: string | null
  patient: AccessLogPatientRef | null
}

/** 공용 커서 페이지 — total_hint는 현재 필터 전체 건수(전체 N건 중 이 환자 M건의 M). */
export interface AccessLogPage {
  rows: AccessLogRow[]
  next_cursor: string | null
  total_hint: number
}

export interface AccessLogQuery {
  /** URL에는 patient_id만 남긴다 — 이름·전화 원문은 넣지 않는다(ALOG-FILTER-04). */
  patientId?: string | null
  /** from 포함(ALOG-FILTER-07). ISO8601. */
  from?: string | null
  /** to 제외(ALOG-FILTER-07). ISO8601. */
  to?: string | null
  /** 200건 이후 이어보기의 불투명 커서(ALOG-FILTER-06). */
  cursor?: string | null
}

/**
 * [ALOG-FILTER-01·06·07] 최신 200건 + 환자·기간 필터 + cursor 이어보기.
 * limit은 서버가 200으로 고정한다 — 클라이언트가 보내지 않는다(ALOG-LIST-09).
 */
export function getAccessLogs(q: AccessLogQuery = {}): Promise<AccessLogPage> {
  const params = new URLSearchParams()
  if (q.patientId) params.set('patient_id', q.patientId)
  if (q.from) params.set('from', q.from)
  if (q.to) params.set('to', q.to)
  if (q.cursor) params.set('cursor', q.cursor)
  const qs = params.toString()
  return apiFetch<AccessLogPage>(`/admin/access-logs${qs ? `?${qs}` : ''}`)
}
