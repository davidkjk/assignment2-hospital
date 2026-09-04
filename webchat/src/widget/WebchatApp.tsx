import { useState, useEffect, useRef } from 'react';
import type { WebchatApi, CardMessage } from '../api/webchatApi';
import type { WebAuth } from '../auth/webAuth';
import { WebchatWidget, type PendingAction, type HandoffSummary } from './WebchatWidget';
import { AuthGateModal } from './AuthGateModal';
import { HandoffForm } from './HandoffForm';
import { WebCard, type CardContext } from './cards/WebCard';
import { env } from '../lib/env';

// 홈페이지(호스트) 통합용 postMessage 계약(Task 2). 위젯은 열기/미읽음만 부모와 주고받는다 — 데이터는
// 위젯 자체의 same-origin 프록시로 백엔드에 닿으므로 CORS가 없다. 배포는 env.hostOrigin으로 origin을 고정한다.
const POST_TARGET = env.hostOrigin || '*';                 // 부모로 보낼 대상(개발/단독은 '*')
function toHost(msg: { type: string; value?: boolean }) {
  // 단독/테스트에선 window.parent === window라 자기 자신에게 가고(수신 리스너가 webchat:* 는 무시), iframe이면 홈페이지로 간다.
  window.parent.postMessage(msg, POST_TARGET);
}

export function WebchatApp({ api, auth, hospitalPhone }: { api: WebchatApi; auth: WebAuth; hospitalPhone: string }) {
  const [open, setOpen] = useState(false);                 // 위젯 열림(홈페이지 host:setOpen과 위젯 런처가 공유)
  const [hasUnread, setHasUnread] = useState(false);       // 직원 답변 도착(닫힘 중 런처 ● 표시용)
  const [authAction, setAuthAction] = useState<PendingAction | null>(null);
  const [handoff, setHandoff] = useState<HandoffSummary | null>(null);
  const [reconfirm, setReconfirm] = useState<CardMessage | null>(null);
  const [doneCards, setDoneCards] = useState<CardMessage[]>([]); // 실행 결과 카드를 피드 끝에 쌓는다(재확인 카드/피드 카드 공통)
  const [patientId, setPatientId] = useState<string | null>(null);

  // 마운트 통지 + 열림/미읽음 변화를 부모에 통지 + 부모의 host:setOpen 수신(origin 검증).
  const firstOpenPost = useRef(true);
  useEffect(() => { toHost({ type: 'webchat:ready' }); }, []);
  useEffect(() => {
    // 마운트 초기값(open=false)은 통지하지 않는다 — 호스트가 막 연 창을 뒤늦게 닫는 경합을 막는다(실제 변화만 통지).
    if (firstOpenPost.current) { firstOpenPost.current = false; return; }
    toHost({ type: 'webchat:setOpen', value: open });
  }, [open]);
  useEffect(() => { toHost({ type: 'webchat:unread', value: hasUnread }); }, [hasUnread]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (env.hostOrigin && e.origin !== env.hostOrigin) return; // 배포는 홈페이지 origin만 신뢰
      const d = e.data as { type?: string; value?: unknown } | null;
      if (d && d.type === 'host:setOpen') setOpen(Boolean(d.value));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const cardCtx = (send: (t: string) => void): CardContext => ({
    isAnonymous: !patientId,
    onAuthGate: setAuthAction,                               // 카드의 로그인 필요 행동 → 관문
    // [신청]/[취소] 확정 → 서버 실행 결과 카드(booking_done·cancel_done·실패 재확인)를 같은 대화 흐름의 다음 메시지로 피드에 삽입한다.
    // (CCARD-BOOKDONE-SHOW-01: 결과를 받은 뒤 한 번만 삽입 / 성공 위장 금지 — 서버가 준 실제 카드를 그대로 표시)
    onExecute: async (cardType, payload) => {
      const { result } = await api.executeCard({ cardType, payload, clientMessageId: crypto.randomUUID() });
      setReconfirm(null);
      setDoneCards((prev) => [...prev, result]);
    },
    onPick: send,
    onReconsult: () => {}, onRebook: () => setAuthAction({ kind: 'book' }),
  });

  const afterAuth = async (pid: string, action: PendingAction) => {
    setPatientId(pid);
    setAuthAction(null);                                      // 로그인 자체는 성공 — 관문을 먼저 닫는다
    // 귀속·재검증은 ⑦(chat/attribute·cards/revalidate) 라우트에 의존한다. 아직 미배선(404)이라
    // 여기서 던져도 로그인은 성공으로 둔다(SP1 범위 = 로그인·patientId 확보까지). ⑦ 오면 실동작.
    try {
      await api.attributeSessionToAccount({ patientId: pid });  // WEBMOD-AUTH-09: 명시 인증에만 귀속
      if (action.kind === 'view_my_appointments') { await api.revalidateAction({ action }); return; } // WEBMOD-AUTH-07: 최신 조회
      const { card } = await api.revalidateAction({ action });  // WEBMOD-AUTH-08 / BOOKCONF-03: 재확인 카드(자동 실행 없음)
      setReconfirm(card);
    } catch {
      // ⑦ 미배선 — 재확인 카드·귀속은 건너뛴다(로그인은 이미 성공 처리됨).
    }
  };

  return (
    <div id="webchat-app" className="wc-root" role="region" aria-label="AI 상담봇">
      <WebchatWidget
        api={api} hospitalPhone={hospitalPhone}
        open={open} onOpenChange={setOpen} onUnreadChange={setHasUnread} // 홈페이지 iframe 열기/미읽음 배선(Task 2)
        onAuthGate={setAuthAction}                            // WEBMOD-AUTH-01: 관문 열기(원래 행동·문맥 보존)
        onHandoffNeeded={setHandoff}
        renderCard={(payload, slot) => <WebCard payload={payload} ctx={cardCtx(slot.send)} />}
        extraCards={doneCards}                                // 실행 결과 완료 카드를 피드 끝에 렌더(재열기해도 유지)
      />
      {authAction && <AuthGateModal action={authAction} auth={auth} onClose={() => setAuthAction(null)} onAuthenticated={afterAuth} />}
      {handoff && <HandoffForm api={api} summary={handoff} onDone={() => setHandoff(null)} onCancel={() => setHandoff(null)} />}
      {reconfirm && (
        <div className="wc-scrim">
          <div role="dialog" aria-label="예약 재확인" className="wc-modal wc-modal--card">
            <WebCard payload={reconfirm.payload} ctx={cardCtx(() => {})} />
          </div>
        </div>
      )}
    </div>
  );
}
