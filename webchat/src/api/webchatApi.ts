import { loadAnonToken } from '../state/anonSession';
import type { PendingAction } from '../widget/WebchatWidget';

export type SenderType = 'patient' | 'bot' | 'staff' | 'system';
export type MessageType = 'text' | 'card' | 'system';
export type SendState = 'sending' | 'sent' | 'failed';

export type ThreadMessage = {
  id: string;
  senderType: SenderType;
  messageType: MessageType;
  content: string | null;         // 카드/시스템은 null 가능(payload가 알맹이)
  payload?: Record<string, unknown> | null;
  clientMessageId?: string;
  sendState?: SendState;          // 클라 로컬 전송 상태(낙관적 말풍선)
};

export type HandoffPhase = 'connecting' | 'inProgress' | 'answered'; // 티켓 pending/in_progress/answered
export type HandoffStatus = {
  phase: HandoffPhase | null;     // null = 조회 전(로딩)
  assigneeName?: string;
  assigneeRole?: string;
  isOpen: boolean;                // 서버 단일 is_open(at)
  hoursNote?: string;             // 운영시간 안/밖 안내(서버 문구)
  loadError?: boolean;
};

export type SessionState = {
  threadId: string;
  aiSessionId: string;
  anonToken: string;              // 서버가 발급/확인한 익명 토큰
  messages: ThreadMessage[];
};

export type GuideState = { active: boolean; text: string };

export type CardMessage = ThreadMessage & { messageType: 'card'; payload: Record<string, unknown> };

export interface WebchatApi {
  // 익명 토큰이 있으면 복원, 없으면 첫 상담 세션 시작. 서버가 토큰을 확정해 돌려준다.
  startOrRestoreSession(anonToken: string | null): Promise<SessionState>;
  fetchMessages(threadId: string): Promise<ThreadMessage[]>;
  // 멱등: 같은 clientMessageId면 서버가 한 행만 만든다(§8-4). route_taken을 결과로 준다.
  sendMessage(args: {
    threadId: string; aiSessionId: string; content: string; clientMessageId: string;
  }): Promise<{ routeTaken: string; botMessage?: ThreadMessage; handoffTicketId?: string }>;
  fetchHandoff(threadId: string): Promise<HandoffStatus>;
  acknowledgeBatches(threadId: string): Promise<void>; // POST /chat/read
  // 인증 완료 후: 최신 대상·슬롯을 서버에서 재검증한 "재확인 카드"(실행 아님). 서버는 X-Anon-Token으로 세션을 찾는다.
  revalidateAction(args: { action: PendingAction }): Promise<{ card: CardMessage | null }>; // WEBMOD-AUTH-07·08, WEBCARD-BOOKCONF-03 (내 예약 조회는 카드 없이 최신 조회 → null)
  // 재확인 카드의 [신청]/[취소]: 서버가 payload를 재검증하고 실행 → 결과 카드(booking_done/cancel_done). 위변조 payload는 거절.
  executeCard(args: { cardType: string; payload: Record<string, unknown>; clientMessageId: string }): Promise<{ result: CardMessage }>; // WEBCARD-BOOKCONF-01·CANCELCONF-01
  // 익명 인계 티켓 + 연락처 연결(SMS 답변 수신용만). 대화 요약 5항목을 익명 세션 문맥에 연결(서버).
  createHandoffTicket(args: { threadId: string; name: string; phone: string | null; summary: string[] }): Promise<{ ticketId: string }>; // WEBANON-HANDOFF-05·08
  // 명시적 인증 성공 시에만 앞선 익명 상담 이력을 계정에 귀속(유사성 추측 금지). 서버는 X-Anon-Token으로 세션을 찾는다.
  attributeSessionToAccount(args: { patientId: string }): Promise<void>;                  // WEBMOD-AUTH-09
}

const ANON_HEADER = 'X-Anon-Token'; // Task 9 익명 의존성 헤더

// 로그인 성공 시 위젯이 보유한 Supabase 세션의 access token을 준다(귀속·재검증·실행의 환자 신원 검증용).
// 없으면 null — Authorization을 붙이지 않는다(서버가 401로 막는다).
export interface WebchatApiDeps {
  getAccessToken?: () => Promise<string | null>;
}

export function createWebchatApi(baseUrl: string, deps: WebchatApiDeps = {}): WebchatApi {
  // 인증 후 카드 행동(귀속·재검증·실행)은 body의 patientId가 아니라 Bearer로 환자를 확정한다(위조 방지).
  const call = async (path: string, init: RequestInit, anonToken: string | null, authed = false) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as object) };
    if (anonToken) headers[ANON_HEADER] = anonToken; // 익명 토큰으로 익명 세션·방을 찾는다
    if (authed && deps.getAccessToken) {
      const token = await deps.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`; // 명시 인증에만 귀속(WEBMOD-AUTH-09)
    }
    const resp = await fetch(baseUrl + path, { ...init, headers });
    if (!resp.ok) throw new Error(`webchat_api_${resp.status}`); // 화면이 한글 오류로 변환(개발자 오류문 노출 금지)
    return resp.json();
  };
  return {
    async startOrRestoreSession(anonToken) {
      const j = await call('/chat/sessions', { method: 'POST', body: JSON.stringify({ channel: 'web' }) }, anonToken);
      return j as SessionState;
    },
    async fetchMessages(threadId) {
      const j = await call(`/chat/threads/${threadId}/messages`, { method: 'GET' }, null);
      return j.messages as ThreadMessage[];
    },
    async sendMessage(a) {
      return call('/chat/messages', { method: 'POST', body: JSON.stringify(a) }, null);
    },
    async fetchHandoff(threadId) {
      return call(`/chat/threads/${threadId}/handoff`, { method: 'GET' }, null);
    },
    async acknowledgeBatches(threadId) {
      await call('/chat/read', { method: 'POST', body: JSON.stringify({ threadId }) }, null);
    },
    async revalidateAction(args) {
      return call('/chat/cards/revalidate', { method: 'POST', body: JSON.stringify(args) }, loadAnonToken(), true);
    },
    async executeCard(args) {
      return call('/chat/cards/execute', { method: 'POST', body: JSON.stringify(args) }, loadAnonToken(), true);
    },
    async createHandoffTicket(args) {
      return call('/chat/handoff', { method: 'POST', body: JSON.stringify(args) }, loadAnonToken());
    },
    async attributeSessionToAccount(args) {
      await call('/chat/attribute', { method: 'POST', body: JSON.stringify(args) }, loadAnonToken(), true);
    },
  };
}
