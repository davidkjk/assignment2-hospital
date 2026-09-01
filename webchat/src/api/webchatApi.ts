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
}

const ANON_HEADER = 'X-Anon-Token'; // Task 9 익명 의존성 헤더

export function createWebchatApi(baseUrl: string): WebchatApi {
  const call = async (path: string, init: RequestInit, anonToken: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as object) };
    if (anonToken) headers[ANON_HEADER] = anonToken; // 로그인이 아니라 익명 토큰으로 소유권을 잇는다
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
  };
}
