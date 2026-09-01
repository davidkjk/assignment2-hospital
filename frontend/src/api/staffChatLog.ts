import { apiFetch } from './httpClient'
import type { ConvMessage, Sender } from './staffChatDetail'

// 상담봇 기록(/chatlog)·환자상세 상담 섹션의 얇은 클라이언트 — 경로·형태만 안다.
// 오류·오프라인·세션은 httpClient(apiFetch)가 지킨다. snake_case는 여기서 한 번만 카멜로 옮긴다.
//
// 백엔드 계약(Task 19에서 이름으로 못박음 → backend/app/routers/staff_chat.py):
//  - GET /staff/chat/logs?channel=&route_taken=   → 앱·웹 대화 한 목록(SCOPE-01). 최신 메시지 미리보기.
//  - GET /staff/chat/messages/{id}/sources         → 봇 답변 근거 스냅샷(rank·similarity·title·body, Task 4).
//  - GET /staff/patients/{id}/support-tickets      → 환자 범위 상담 티켓(최신순+id 동점키, PTDET-SUPPORT-03).

// route_taken은 chat_messages의 서버 enum(Task 5). 계약 밖 값도 버리지 않고 그대로 실어 화면이 EXC로 표시한다.
export type Channel = 'app' | 'web'
export type RouteTaken = 'emergency' | 'rag' | 'department_guide' | 'agent' | 'handoff'

/** 상담 기록 목록의 한 줄 — 계약 밖 채널·갈래는 원문 문자열로 보존한다(EXC-01). */
export interface ChatLogRow {
  threadId: string
  channel: Channel | string
  routeTaken: RouteTaken | string
  summary: string // 질문 요약(최신 메시지 미리보기)
  at: string // ISO 발생 시각
}
/** 봇 답변 근거 한 건(스냅샷) — 승인 시점의 제목·본문을 그대로 보관한다(Task 4). */
export interface ChatLogSource {
  rank: number
  similarity: number | null
  titleSnapshot: string
  bodySnapshot: string
}
export interface ChatLogQuery {
  channel?: Channel
  routeTaken?: RouteTaken
}

/** 서버 응답(snake_case) — 매핑 전 원형. 프론트 어디에도 새 나가지 않는다. */
interface ChatLogRowDto {
  thread_id: string
  channel: string
  route_taken: string
  summary: string
  at: string
}
interface ChatLogSourceDto {
  rank: number
  similarity: number | null
  title_snapshot: string
  body_snapshot: string
}

function rowFromDto(d: ChatLogRowDto): ChatLogRow {
  return { threadId: d.thread_id, channel: d.channel, routeTaken: d.route_taken, summary: d.summary, at: d.at }
}
function sourceFromDto(d: ChatLogSourceDto): ChatLogSource {
  return { rank: d.rank, similarity: d.similarity, titleSnapshot: d.title_snapshot, bodySnapshot: d.body_snapshot }
}

// 값이 있는 필터만 쿼리에 싣는다. 서버 계약대로 route_taken은 snake로 보낸다.
function qs(q: ChatLogQuery): string {
  const p = new URLSearchParams()
  if (q.channel != null) p.set('channel', q.channel)
  if (q.routeTaken != null) p.set('route_taken', q.routeTaken)
  return p.toString()
}

export interface ChatLogApi {
  // 서버가 채널·갈래로 걸러 준다. 프론트는 계약 밖 값을 버리지 않는다(EXC-01).
  listLogs(q: ChatLogQuery): Promise<ChatLogRow[]>
  // 봇 메시지 하나의 승인 근거 스냅샷. 없으면 빈 배열(근거 자료 없음, SOURCE-02).
  listSources(messageId: string): Promise<ChatLogSource[]>
}

// 상세 대화 원문(DETAIL-01) — 직원 콘솔 말풍선(TicketConversation)을 그대로 재사용한다.
// 읽음·문자 배지는 기록 열람에선 뜻이 없어 false로 채운다(로그는 처리 화면이 아니다).
interface ConvMessageDto {
  id: string
  sender: Sender
  body: string | null
  at: string
}
export async function fetchThreadConversation(threadId: string): Promise<ConvMessage[]> {
  const rows = await apiFetch<ConvMessageDto[]>(`/staff/chat/logs/${threadId}`)
  return rows.map((d) => ({
    id: d.id, sender: d.sender, body: d.body, at: d.at, patientRead: false, staffUnread: false, smsSent: false,
  }))
}

/** 실 구현 — httpClient(apiFetch)로 서버 문장·401·오프라인을 그대로 지킨다. */
export const staffChatLogApi: ChatLogApi = {
  async listLogs(q) {
    const query = qs(q)
    const rows = await apiFetch<ChatLogRowDto[]>(`/staff/chat/logs${query ? `?${query}` : ''}`)
    return rows.map(rowFromDto)
  },
  async listSources(messageId) {
    const rows = await apiFetch<ChatLogSourceDto[]>(`/staff/chat/messages/${messageId}/sources`)
    return rows.map(sourceFromDto)
  },
}
