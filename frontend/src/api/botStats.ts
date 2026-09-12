import { apiFetch, ApiError } from './httpClient'
import { supabase } from '../lib/supabaseClient'

// 관리자 상담봇 처리 현황(통계)의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient(apiFetch)가 지킨다.
//
// ⚠️⚠️ 이 엔드포인트들은 대부분 라우터에 없다(Task 9가 상담봇 통계 API를 안 만듦) → **소비 계약 선언**이다.
//   서버가 집계를 아예 제공하지 않으면 501을 주고, 여기서 이를 `{ kind: 'no_contract' }`로 옮긴다.
//   ⭐ 501(계약 부재)을 유효한 0건으로 위장하지 않는다 — 화면(BOTSTAT-DASH-05·QTOP-RANK-10)이 둘을 구분한다.
//
// 백엔드 계약(⑦ BLOCKED-BEFORE-MERGE):
//  - GET /admin/chat/stats/ranking?from=&to=            → 많이 들어온 질문 집계(QTOP-RANK)          ⚠️ 선언(집계 함수 부재)
//  - GET /admin/chat/stats/ranking/{clusterId}?from=&to= → 묶음 상세(대표 질문 + 원 질문들)          ⚠️ 선언
//  - GET /admin/chat/stats?from=&to=                     → 상담봇 운영 지표(BOTSTAT-DASH)            ⚠️ 선언(placeholder 0)
//  - GET /admin/chat/stats/{metric}/detail?from=&to=    → 지표 드릴다운(마스킹 DTO, STAT-DRILL 계열) ⚠️ 선언
//  - GET /admin/chat/stats/export.csv?from=&to=          → 집계 CSV(k=5 억제, STAT-EXPORT/MASK 계열)  ⚠️ 선언

export type DateRange = { from: string; to: string }

// ── 많이 들어온 질문(QTOP-RANK) ──
export type RankCluster = { id: string; representative: string; count: number }
export type RankingResult =
  | { kind: 'clusters'; clusters: RankCluster[]; embeddingGap: boolean } // 임베딩 불가 질문 있으면 embeddingGap (QTOP-RANK-11)
  | { kind: 'empty' } //        집계 성공·질문 0건 (QTOP-RANK-07)
  | { kind: 'no_contract' } //  서버가 전체 질문 집계 미제공 (QTOP-RANK-10)
export type RankClusterDetail = { representative: string; questions: string[] }

// ── 운영 지표(BOTSTAT-DASH) — 유효한 0건과 계약 부재를 타입에서 구분한다(정본 §0·§4) ──
export type MetricValue =
  | { kind: 'value'; count: number; drillable: boolean } // 실제 값(0건 포함, BOTSTAT-DASH-04)
  | { kind: 'no_contract' } //                             집계 계약 부재(BOTSTAT-DASH-05)
export type InflowShare =
  | { kind: 'value'; app: number; staff: number; chatbot: number } // 3분류 건수(원값) — 표시 시 총합으로 나눠 비율 환산(BOTSTAT-DASH-02·STAT-METRIC-05)
  | { kind: 'no_contract' }
export type BotMetrics = {
  inflow: InflowShare // 예약 유입원 3분류(app/staff/chatbot)
  inquiries: MetricValue // 문의 수
  selfServed: MetricValue // 자체 안내
  handedOff: MetricValue // 직원 연결
}
export type DrillRow = { patientMasked: string; at: string } // 서버가 준 마스킹 표시값만(BOTSTAT-DASH-11)

export interface BotStatsApi {
  getRanking(range: DateRange): Promise<RankingResult>
  getRankingCluster(id: string, range: DateRange): Promise<RankClusterDetail>
  getMetrics(range: DateRange): Promise<BotMetrics | { kind: 'no_contract' }>
  getDrill(metric: string, range: DateRange): Promise<DrillRow[]>
  exportCsv(range: DateRange): Promise<Blob>
}

const NO_CONTRACT = { kind: 'no_contract' as const }

/** 서버가 집계를 통째로 미제공(501)하면 계약 부재로 옮기고, 그 밖의 오류는 그대로 던진다. */
function noContractOn501(e: unknown): { kind: 'no_contract' } {
  if (e instanceof ApiError && e.status === 501) return NO_CONTRACT
  throw e
}

const qs = (r: DateRange) => `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`

type MetricDto = { kind: 'value'; count: number; drillable: boolean } | { kind: 'no_contract' }
type MetricsDto = {
  inflow: InflowShare
  inquiries: MetricDto
  self_served?: MetricDto
  selfServed?: MetricDto
  handed_off?: MetricDto
  handedOff?: MetricDto
}
type RankingDto =
  | { kind: 'clusters'; clusters: RankCluster[]; embedding_gap?: boolean; embeddingGap?: boolean }
  | { kind: 'empty' }
  | { kind: 'no_contract' }
type DrillDto = { patient_masked?: string; patientMasked?: string; at: string }

export const botStatsApi: BotStatsApi = {
  async getRanking(range) {
    try {
      const dto = await apiFetch<RankingDto>(`/admin/chat/stats/ranking?${qs(range)}`)
      if (dto.kind === 'clusters') {
        return { kind: 'clusters', clusters: dto.clusters, embeddingGap: dto.embeddingGap ?? dto.embedding_gap ?? false }
      }
      return dto // empty | no_contract
    } catch (e) {
      return noContractOn501(e)
    }
  },

  getRankingCluster(id, range) {
    return apiFetch<RankClusterDetail>(`/admin/chat/stats/ranking/${encodeURIComponent(id)}?${qs(range)}`)
  },

  async getMetrics(range) {
    try {
      const dto = await apiFetch<MetricsDto>(`/admin/chat/stats?${qs(range)}`)
      return {
        inflow: dto.inflow,
        inquiries: dto.inquiries,
        selfServed: dto.selfServed ?? dto.self_served ?? NO_CONTRACT,
        handedOff: dto.handedOff ?? dto.handed_off ?? NO_CONTRACT,
      }
    } catch (e) {
      return noContractOn501(e)
    }
  },

  async getDrill(metric, range) {
    const rows = await apiFetch<DrillDto[]>(`/admin/chat/stats/${encodeURIComponent(metric)}/detail?${qs(range)}`)
    return rows.map((r) => ({ patientMasked: r.patientMasked ?? r.patient_masked ?? '', at: r.at }))
  },

  async exportCsv(range) {
    // apiFetch는 JSON을 파싱하므로 CSV(blob)엔 쓰지 못한다. 자격만 httpClient와 같은 방식으로 붙인다.
    let auth: Record<string, string> = {}
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) auth = { Authorization: `Bearer ${token}` }
    } catch {
      /* 자격 첨부 실패는 그대로 두고 서버 판단에 맡긴다. */
    }
    const resp = await fetch(`/admin/chat/stats/export.csv?${qs(range)}`, { headers: auth })
    if (!resp.ok) throw new ApiError(`bot_stats_csv_${resp.status}`, resp.status)
    return resp.blob()
  },
}
