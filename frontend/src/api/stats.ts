import { apiFetch } from './httpClient'

// 운영 통계(/admin/stats)의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient가 지킨다.
// 백엔드 계약: backend/app/services/stats_service.py (get_stats·get_stats_detail·log_stats_export)
//
// ⭐ 결정5: 지표마다 기준일이 다르고 그 사실을 basis로 화면에 드러낸다 — 기준이 다른 지표를
//    한 날짜 사건으로 합치지 않는다.
// ⭐ 결정21: 서버·화면은 소수 억제를 하지 않는다. k=5 억제는 CSV 파일 전용이다(exportCsv.ts).
// ⭐ 결정22: 집계 표 조회는 감사 행을 만들지 않는다. 드릴다운은 서버가 /stats/detail 안에서
//    stats_drilldown으로 남기고(프론트가 따로 안 보냄), CSV만 프론트가 /audit/stats로 남긴다.

/** 기준일 코드 → 화면 문구(STAT-SCOPE-03·결정5). 서버가 준 코드만 매핑한다. */
export const BASIS_LABEL: Record<string, string> = {
  created_at: '생성일 기준',
  status_changed_at: '상태 전이일 기준',
  wait_started_at: '대기 시작일 기준',
  slot_start_time: '슬롯 시작 시각 기준',
}

/** 유입원 3분류(STAT-METRIC-05·결정23) — 앱·직원·챗봇을 섞지 않는다. */
export interface SourceMix {
  basis: string
  rows: { app: number; staff: number; chatbot: number }
  total: number
}

export interface MetricValue {
  basis: string
  value: number
}

/** 평균 대기(분) — 기준일은 대기 시작일(결정5). */
export interface WaitMetric {
  basis: string
  /** 평균 대기시간(분). */
  avg_minutes: number
  /** 기준 초과(오래 기다린) 사례 수. 임계값 자체도 함께 온다. */
  over_threshold: number
  threshold_minutes: number
}

/** 시간대별 방문(STAT-METRIC-03) — 시간 미기록은 0시로 뭉개지 않고 따로 온다. */
export interface VisitsByHour {
  basis: string
  by_hour: Record<string, number>
  unknown_time: number
}

/**
 * 상담봇 지표(STAT-METRIC-06) — 4단계 계약이 없으면 null이다(0으로 위장 금지).
 * 값 자체가 아직 없는 개별 지표(질문 순위 등)는 null 필드로 온다.
 */
export interface BotMetrics {
  total_inquiries: number
  self_served: number
  handoff: number
  top_questions: string[] | null
}

export interface StatsResponse {
  source_mix: SourceMix
  cancelled: MetricValue
  no_show: MetricValue
  visits: MetricValue
  wait: WaitMetric
  visits_by_hour: VisitsByHour
  bot: BotMetrics | null
}

/** 진료과·의사별 표(STAT-METRIC-02) — 표시명만, UUID는 안 온다. */
export interface StatsByRow {
  label: string
  booked: number
  visited: number
  no_show: number
}
export interface StatsByResponse {
  by: 'department' | 'doctor'
  rows: StatsByRow[]
}

/**
 * 드릴다운 한 행(STAT-DRILL-02) — 서버가 마스킹해 보낸 값만. 원본 name·phone·birth_date는
 * 응답에 아예 없다(patient_row_dto 화이트리스트). patient_id는 행→환자상세 이동용(결정24).
 */
export interface DrilldownRow {
  patient_id: string
  masked_name?: string
  masked_phone?: string
  masked_birth_date?: string
  /** 예약 식별자. */
  id?: string
  occurred_at?: string
  wait_minutes?: number
}

export interface DrilldownPage {
  rows: DrilldownRow[]
  next_cursor: string | null
  has_more: boolean
  /** 전체 건수 — 일부만 반환하면 「최근 N건」을 밝히는 데 쓴다(STAT-DRILL-03). */
  total?: number
}

function periodQuery(from: string, to: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ from, to, ...(extra ?? {}) })
  return q.toString()
}

/** 운영 지표 묶음(STAT-METRIC-01). 감사 행을 만들지 않는다(STAT-AUDIT-01·결정22). */
export function getStats(from: string, to: string) {
  return apiFetch<StatsResponse>(`/stats?${periodQuery(from, to)}`)
}

/** 진료과·의사별 표(STAT-METRIC-02). by=department|doctor. */
export function getStatsBy(from: string, to: string, by: 'department' | 'doctor') {
  return apiFetch<StatsByResponse>(`/stats?${periodQuery(from, to, { by })}`)
}

/**
 * 드릴다운 명단(STAT-DRILL-01~03). 서버가 이 호출 안에서 stats_drilldown 감사를 남긴다
 * (결정22) — 프론트는 따로 감사 요청을 보내지 않는다. 환자 원본·검색어를 쿼리에 싣지 않는다.
 */
export function getStatsDetail(
  metric: string,
  from: string,
  to: string,
  opts?: { dept?: string; dim?: 'department' | 'doctor'; cursor?: string },
) {
  const extra: Record<string, string> = { metric }
  // dept·dim은 진료과·의사별 표의 셀을 눌렀을 때만 실린다 — 서버가 그 그룹으로 명단을 좁힌다
  // (STAT-DRILL-03). dim이 department/doctor 어느 쪽인지에 따라 dept 라벨의 해석이 갈린다.
  if (opts?.dept) extra.dept = opts.dept
  if (opts?.dim) extra.dim = opts.dim
  if (opts?.cursor) extra.cursor = opts.cursor
  return apiFetch<DrilldownPage>(`/stats/detail?${periodQuery(from, to, extra)}`)
}

/**
 * CSV 내보내기 감사(STAT-AUDIT-02·결정22) — 파일은 클라이언트가 만들지만 감사는 서버에 남긴다.
 * 실행자·지표·행 수·억제 여부만 보낸다. 환자명·전화·생년월일·검색어는 payload에 넣지 않는다.
 */
export function logStatsExport(body: { metric: string; row_count: number; suppressed: boolean }) {
  return apiFetch<{ ok: boolean }>('/audit/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
