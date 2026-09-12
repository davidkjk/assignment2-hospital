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
  // CHAT-HANDOFF-STATE-03: 직원이 [상담 종료]했을 때만 true(서버 status='answered'). 단순 답장은
  //   phase='answered'로 올라와도 closed=false — '상담 종료'와 '답변 도착'을 가르는 신호(webchat_service).
  closed?: boolean;
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
  // 스트리밍 전환: 사용자 메시지만 저장하고 즉시 ack를 준다(봇 답은 실시간 채널). gen=답변 1건 식별 uuid.
  //   멱등: 같은 clientMessageId면 서버가 한 행만 만든다(§8-4). routeTaken은 'staff'(인계 모드) 또는 null.
  sendMessage(args: {
    threadId: string; aiSessionId: string; content: string; clientMessageId: string;
  }): Promise<{ accepted: boolean; gen: string; routeTaken: string | null; userMessageId: string | null }>;
  fetchHandoff(threadId: string): Promise<HandoffStatus>;
  acknowledgeBatches(threadId: string): Promise<void>; // POST /chat/read
  // 로그인 전 예약 탐색(진료과·의사·날짜) — X-Anon-Token만, Bearer 없음(늦은 관문 ④). 다음 카드를 준다.
  navigateAction(args: { action: { kind: string; payload: Record<string, unknown> } }): Promise<{ card: CardMessage }>; // WEBBOOK-02~04
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
      // 서버 응답(ack): { accepted, threadId, userMessageId, gen, routeTaken }. 봇 답은 실시간(bot_delta/done).
      // [G7] authed=true — 로그인 후(예약 관문 ④에서 인증)엔 Bearer를 붙여 환자 경로(load_owned_session)를 탄다.
      //   로그인 시 attribute_session_to_patient가 스레드를 환자 소유로 바꾸는데, 익명 경로(load_anonymous_session)는
      //   owner_type='anonymous_web'만 찾아 404 → 예약 후 대화가 끊겼다. anonToken도 실어 미로그인은 그대로 익명 경로.
      const j = await call('/chat/messages', { method: 'POST', body: JSON.stringify(a) }, loadAnonToken(), true);
      return {
        accepted: !!j.accepted,
        gen: (j.gen ?? '') as string,
        routeTaken: (j.routeTaken ?? j.route_taken ?? null) as string | null,
        userMessageId: (j.userMessageId ?? j.user_message_id ?? null) as string | null,
      };
    },
    async fetchHandoff(threadId) {
      return call(`/chat/threads/${threadId}/handoff`, { method: 'GET' }, null);
    },
    async acknowledgeBatches(threadId) {
      await call('/chat/read', { method: 'POST', body: JSON.stringify({ threadId }) }, null);
    },
    async navigateAction(args) {
      // 로그인 전 탐색 — 익명(Bearer 없이). 서버가 nav kind면 X-Anon-Token으로만 다음 카드를 준다.
      return call('/chat/cards/revalidate', { method: 'POST', body: JSON.stringify(args) }, loadAnonToken());
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
