import { apiFetch } from './httpClient'

// [ERRADM-*] 시스템 오류 기록(/admin/errors)의 얇은 클라이언트 — 경로·형태만 안다.
// 오류·오프라인(status 0)·세션 만료(온라인 401)는 httpClient가 지킨다.
// 백엔드 계약: backend/app/routers/error_logs.py
//
// ⚠️ 화면 계약엔 안전 요약(summary)만 온다(결정 #20) — DB의 기술 상세(message)·비밀키·환자
//    원문은 응답에 아예 담기지 않는다. 표시층은 여기 있는 값만 그린다.

/** 한 오류 행 — 서버가 준 것만. 기술 상세(message)는 없다(ERRADM-LIST-04). */
export interface ErrorLogRow {
  id: string
  /** 서버 절대 시각(ISO8601). 상대값으로 바꾸지 않는다(ERRADM-LIST-02). */
  occurred_at: string
  /** API feature를 그대로. 임의 번역·분할 안 함(ERRADM-LIST-03). */
  feature: string
  /** 사람이 읽는 안전 요약(ERRADM-LIST-04). */
  summary: string
}

export interface ErrorLogQuery {
  /** 시작일 'YYYY-MM-DD' 포함(ERRADM-FILTER-02). */
  from?: string | null
  /** 종료일 'YYYY-MM-DD' — 서버가 그날 끝까지로 해석(ERRADM-FILTER-02). */
  to?: string | null
}

/**
 * [ERRADM-FILTER-01·02][ERRADM-LIST-06] 최근 200건 + 기간 필터.
 * limit은 서버가 200으로 고정한다 — 클라이언트가 보내지 않는다.
 */
export function getErrorLogs(q: ErrorLogQuery = {}): Promise<ErrorLogRow[]> {
  const params = new URLSearchParams()
  if (q.from) params.set('from', q.from)
  if (q.to) params.set('to', q.to)
  const qs = params.toString()
  return apiFetch<ErrorLogRow[]>(`/error-logs${qs ? `?${qs}` : ''}`)
}
