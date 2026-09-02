import { apiFetch } from './httpClient'

// 관리자 병원 안내자료(KB)의 얇은 클라이언트 — 경로·형태만 안다. 오류·오프라인·세션은 httpClient(apiFetch)가 지킨다.
// snake_case는 여기서 한 번만 카멜로 옮긴다. 화면(KbList·KbEditor·KbApproveFlow·KbHistory)은 이 계약만 본다.
//
// 백엔드 계약(Task 7 kb_service 소비): backend/app/services/chat/kb_service.py
//  - GET  /admin/chat/kb?category=&status=      → 목록(KBADM-LIST)
//  - GET  /admin/chat/kb/{id}                    → 편집 prefill 상세(KBADM-EDITOR)
//  - POST /admin/chat/kb                         → 생성(create_document)                 ⟵ 라우터에 있음
//  - PUT  /admin/chat/kb/{id}                    → 저장=pending(submit_edit, 승인 전 비공개)  ⚠️ 계약 선언
//  - POST /admin/chat/kb/{id}/approve            → 승인=재청킹·재임베딩 트랜잭션            ⟵ 라우터에 있음
//  - POST /admin/chat/kb/{id}/reject             → 대기 수정본 반려(reject_pending_edit)     ⚠️ 계약 선언
//  - POST /admin/chat/kb/{id}/archive            → 보관(archive_document)                    ⚠️ 계약 선언
//  - GET  /admin/chat/kb/{id}/revisions          → 수정이력(list_revisions)                  ⚠️ 계약 선언
//
// ⭐ 저장(submitEdit)은 pending_*에 담고 라이브(title/content/is_restricted)를 즉시 안 바꾼다(승인 전 비공개, EDITOR-06).
//    라이브 교체는 approveDoc(재임베딩 성공)만이 한다 — 성공 전에는 기존 승인본이 유지된다(EDITOR-10).

export type KbStatus = 'draft' | 'approved' | 'archived'

/** 목록 행 모양(카멜). */
export interface KbDoc {
  id: string
  title: string
  category: string
  status: KbStatus
  isRestricted: boolean
  hasPendingEdit: boolean // pending_* 채워짐 — 라이브와 다른 수정본이 승인 대기 중
  updatedAt: string // 최근 수정 시각(ISO) — 목록 정렬·표시
}

/** 편집 prefill 상세 — 라이브 본문 + 대기 수정본(있으면). */
export interface KbDetail extends KbDoc {
  content: string
  pendingTitle: string | null
  pendingContent: string | null
}

/** 수정이력 한 항목 — 그 시점의 읽기 전용 스냅샷. approvedBy 없으면 지어내지 않는다(HISTORY-03). */
export interface KbRevision {
  id: string
  at: string
  title: string
  content: string
  approvedBy: string | null
}

export interface KbQuery {
  category?: string
  status?: KbStatus
}

export interface KbSubmit {
  title: string
  category: string
  content: string
  isRestricted: boolean
}

export type KbCreate = KbSubmit

export interface KbAdminApi {
  listDocs(q: KbQuery): Promise<KbDoc[]> // GET /admin/chat/kb              ⚠️ 계약 선언
  getDoc(id: string): Promise<KbDetail> // GET /admin/chat/kb/{id}          ⚠️ 계약 선언
  createDoc(d: KbCreate): Promise<KbDoc> // POST /admin/chat/kb
  submitEdit(id: string, d: KbSubmit): Promise<void> // PUT → pending       ⚠️ 계약 선언
  approveDoc(id: string): Promise<void> // POST .../approve (재임베딩 트랜잭션)
  rejectEdit(id: string): Promise<void> // POST .../reject                  ⚠️ 계약 선언
  archiveDoc(id: string): Promise<void> // POST .../archive                 ⚠️ 계약 선언
  listRevisions(id: string): Promise<KbRevision[]> // GET .../revisions     ⚠️ 계약 선언
}

/** 서버 응답(snake_case) — 매핑 전 원형. 프론트 어디에도 새 나가지 않는다. */
interface KbDocDto {
  id: string
  title: string
  category: string
  status: KbStatus
  is_restricted: boolean
  has_pending_edit: boolean
  updated_at: string
}
interface KbDetailDto extends KbDocDto {
  content: string
  pending_title: string | null
  pending_content: string | null
}
interface KbRevisionDto {
  id: string
  at: string
  title: string
  content: string
  approved_by: string | null
}

const toDoc = (d: KbDocDto): KbDoc => ({
  id: d.id,
  title: d.title,
  category: d.category,
  status: d.status,
  isRestricted: d.is_restricted,
  hasPendingEdit: d.has_pending_edit,
  updatedAt: d.updated_at,
})
const toDetail = (d: KbDetailDto): KbDetail => ({
  ...toDoc(d),
  content: d.content,
  pendingTitle: d.pending_title,
  pendingContent: d.pending_content,
})
const toRevision = (r: KbRevisionDto): KbRevision => ({
  id: r.id,
  at: r.at,
  title: r.title,
  content: r.content,
  approvedBy: r.approved_by,
})

// null/빈 값 키는 걷어내 '전체'로 본다 — status/category 없으면 쿼리 없이 전체 조회.
function queryString(q: KbQuery): string {
  const params = new URLSearchParams()
  if (q.category) params.set('category', q.category)
  if (q.status) params.set('status', q.status)
  const s = params.toString()
  return s ? `?${s}` : ''
}

const jsonPost = (body?: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})

/** 실 구현 — httpClient(apiFetch)로 서버 문장·401·오프라인을 그대로 지킨다. */
export const kbAdminApi: KbAdminApi = {
  async listDocs(q) {
    const rows = await apiFetch<KbDocDto[]>(`/admin/chat/kb${queryString(q)}`)
    return rows.map(toDoc)
  },
  async getDoc(id) {
    return toDetail(await apiFetch<KbDetailDto>(`/admin/chat/kb/${id}`))
  },
  async createDoc(d) {
    return toDoc(await apiFetch<KbDocDto>(`/admin/chat/kb`, jsonPost(d)))
  },
  async submitEdit(id, d) {
    await apiFetch<void>(`/admin/chat/kb/${id}`, jsonPost(d, 'PUT'))
  },
  async approveDoc(id) {
    await apiFetch<void>(`/admin/chat/kb/${id}/approve`, jsonPost())
  },
  async rejectEdit(id) {
    await apiFetch<void>(`/admin/chat/kb/${id}/reject`, jsonPost())
  },
  async archiveDoc(id) {
    await apiFetch<void>(`/admin/chat/kb/${id}/archive`, jsonPost())
  },
  async listRevisions(id) {
    const rows = await apiFetch<KbRevisionDto[]>(`/admin/chat/kb/${id}/revisions`)
    return rows.map(toRevision)
  },
}
