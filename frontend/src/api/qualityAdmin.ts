import { apiFetch, ApiError } from './httpClient'

// 관리자 품질·미해결·오답 처리함·참고 예시(Task 21)의 얇은 클라이언트. snake_case는 여기서 한 번만 카멜로 옮긴다.
// 백엔드 계약: backend/app/routers/admin_chat.py · services/chat/{answer_feedback_service,quality_service,unresolved_service}.py
//  - GET  /admin/chat/unresolved?from=&to=        → 미해결 질문 유사도 묶음(대표 질문+N건). 서버가 집계를 제공하지 않으면 501 → no_contract(UNRES-CLUSTER-10)
//  - GET  /admin/chat/unresolved/{id}?from=&to=   → 묶음 상세(대표 질문·질문 목록)
//  - GET  /admin/chat/feedback?status=            → 오답 처리함(실시간 신고 + 품질 리뷰 교정, 출처 구분 B3)
//  - GET  /admin/chat/feedback/{id} · POST .../apply · POST .../reject(이미 처리됨=409)
//  - GET  /admin/chat/quality?from=&to=&page=     → 미검토 우선 최신순 20건(SD-08) · GET /quality/{sessionId} 원문
//  - POST /admin/chat/quality/{sessionId}/correct → answer_feedback(source=quality_review) · POST .../ok → 문제없음 저장
//  - GET  /admin/chat/examples?active=            → qa_example_bank · POST /examples/{id}/deactivate(이미 비활성=409)

export interface DateRange {
  from: string
  to: string
}

export interface Cluster {
  id: string
  representative: string
  count: number
  lastAt?: string | null // 묶음의 마지막 질문 시각(ISO) — 서버가 주면 표시
}
export type UnresolvedResult =
  | { kind: 'clusters'; clusters: Cluster[]; embeddingGap: boolean } // 임베딩 누락 질문이 있으면 embeddingGap(UNRES-CLUSTER-11)
  | { kind: 'no_contract' } // 서버가 집계를 제공하지 않음(UNRES-CLUSTER-10) — 0건과 구분

export interface ClusterDetail {
  representative: string
  questions: string[]
}

export type FeedbackSource = 'realtime_report' | 'quality_review'
export type FeedbackStatus = 'pending' | 'applied' | 'rejected'
export interface Feedback {
  id: string
  source: FeedbackSource
  question: string
  botAnswer: string
  correction: string | null
  hasSources: boolean
  status: FeedbackStatus
  createdAt: string
}

export type ReviewStatus = 'unreviewed' | 'ok' | 'corrected'
export interface QualitySession {
  id: string
  at: string
  questionSummary: string
  channel: 'app' | 'web'
  hasKbSource: boolean
  reported: boolean
  reviewStatus: ReviewStatus
}
export interface QualitySessionDetail {
  question: string
  answer: string
  kbSource: string | null
  botMessageId: string | null
}

export interface Example {
  id: string
  question: string
  answer: string
  active: boolean
}

export interface QualityApi {
  listUnresolved(range: DateRange): Promise<UnresolvedResult>
  getUnresolvedCluster(id: string, range?: DateRange): Promise<ClusterDetail>
  listBadInbox(status?: FeedbackStatus): Promise<Feedback[]>
  getFeedback(id: string): Promise<Feedback>
  applyFeedback(id: string): Promise<void>
  rejectFeedback(id: string): Promise<void>
  listQualitySessions(range: DateRange, page: number): Promise<{ items: QualitySession[] }>
  getQualitySession(id: string): Promise<QualitySessionDetail>
  saveQualityCorrection(id: string, correction: string): Promise<void>
  markQualityOk(id: string): Promise<void>
  listExamples(active: boolean): Promise<Example[]>
  deactivateExample(id: string): Promise<void>
}

interface ClusterDto {
  id: string
  representative: string
  count: number
  last_at?: string | null
}
interface UnresolvedDto {
  clusters: ClusterDto[]
  embedding_gap: boolean
}
interface FeedbackDto {
  id: string
  source: FeedbackSource
  question: string | null
  bot_answer: string | null
  correction: string | null
  has_sources: boolean
  status: FeedbackStatus
  created_at: string
}
interface QualitySessionDto {
  id: string
  at: string
  question_summary: string | null
  channel: 'app' | 'web'
  has_kb_source: boolean
  reported: boolean
  review_status: ReviewStatus
}
interface QualitySessionDetailDto {
  question: string | null
  answer: string | null
  kb_source: string | null
  bot_message_id: string | null
}
interface ExampleDto {
  id: string
  question: string
  answer: string
  is_active: boolean
}

const toFeedback = (d: FeedbackDto): Feedback => ({
  id: d.id,
  source: d.source,
  question: d.question ?? '',
  botAnswer: d.bot_answer ?? '',
  correction: d.correction,
  hasSources: d.has_sources,
  status: d.status,
  createdAt: d.created_at,
})
const toSession = (d: QualitySessionDto): QualitySession => ({
  id: d.id,
  at: d.at,
  questionSummary: d.question_summary ?? '',
  channel: d.channel,
  hasKbSource: d.has_kb_source,
  reported: d.reported,
  reviewStatus: d.review_status,
})

const rangeQs = (r?: DateRange) => (r ? `?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}` : '')
const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})

/** 실 구현 — httpClient(apiFetch)로 서버 문장·401·오프라인을 그대로 지킨다. */
export const qualityAdminApi: QualityApi = {
  async listUnresolved(range) {
    try {
      const d = await apiFetch<UnresolvedDto>(`/admin/chat/unresolved${rangeQs(range)}`)
      return {
        kind: 'clusters',
        clusters: d.clusters.map((c) => ({ id: c.id, representative: c.representative, count: c.count, lastAt: c.last_at ?? null })),
        embeddingGap: d.embedding_gap,
      }
    } catch (err) {
      // 서버가 집계를 아예 제공하지 않을 때(501)만 계약 부재 — 그 외 실패는 오류 그대로(0건·부재로 위장하지 않음)
      if (err instanceof ApiError && err.status === 501) return { kind: 'no_contract' }
      throw err
    }
  },
  async getUnresolvedCluster(id, range) {
    return apiFetch<ClusterDetail>(`/admin/chat/unresolved/${id}${rangeQs(range)}`)
  },
  async listBadInbox(status = 'pending') {
    const rows = await apiFetch<FeedbackDto[]>(`/admin/chat/feedback?status=${status}`)
    return rows.map(toFeedback)
  },
  async getFeedback(id) {
    return toFeedback(await apiFetch<FeedbackDto>(`/admin/chat/feedback/${id}`))
  },
  async applyFeedback(id) {
    await apiFetch<void>(`/admin/chat/feedback/${id}/apply`, post())
  },
  async rejectFeedback(id) {
    await apiFetch<void>(`/admin/chat/feedback/${id}/reject`, post())
  },
  async listQualitySessions(range, page) {
    const d = await apiFetch<{ items: QualitySessionDto[] }>(
      `/admin/chat/quality?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&page=${page}`,
    )
    return { items: d.items.map(toSession) }
  },
  async getQualitySession(id) {
    const d = await apiFetch<QualitySessionDetailDto>(`/admin/chat/quality/${id}`)
    return { question: d.question ?? '', answer: d.answer ?? '', kbSource: d.kb_source, botMessageId: d.bot_message_id }
  },
  async saveQualityCorrection(id, correction) {
    await apiFetch<void>(`/admin/chat/quality/${id}/correct`, post({ correction_text: correction }))
  },
  async markQualityOk(id) {
    await apiFetch<void>(`/admin/chat/quality/${id}/ok`, post())
  },
  async listExamples(active) {
    const rows = await apiFetch<ExampleDto[]>(`/admin/chat/examples?active=${active}`)
    return rows.map((d) => ({ id: d.id, question: d.question, answer: d.answer, active: d.is_active }))
  },
  async deactivateExample(id) {
    await apiFetch<void>(`/admin/chat/examples/${id}/deactivate`, post())
  },
}
