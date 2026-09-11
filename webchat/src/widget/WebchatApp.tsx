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

// 신뢰할 호스트 origin인가 — 배포 홈페이지(정확 일치) + **그 홈페이지의 Vercel 프리뷰**(같은 프로젝트 stem)까지.
// ⭐ 프리뷰(스테이징)에서도 위젯이 열리게 자기 프로젝트 프리뷰 origin을 허용한다. 임의 사이트는 막는다:
//   hostOrigin이 `https://<stem>.vercel.app`면 `https://<stem>-...vercel.app`(자기 프리뷰)만 추가로 신뢰.
//   hostOrigin 미설정(개발/단독)이면 무검증(기존 동작). 순수 함수라 단위 테스트한다.
export function matchesHostOrigin(origin: string, hostOrigin: string): boolean {
  if (!hostOrigin) return true;                 // 개발/단독: 무검증
  if (origin === hostOrigin) return true;       // 배포(프로덕션) 홈페이지 정확 일치
  const m = hostOrigin.match(/^https:\/\/([a-z0-9-]+)\.vercel\.app$/);
  if (!m) return false;                         // vercel.app 형태가 아니면 정확 일치만 인정(임의 확장 금지)
  return new RegExp(`^https://${m[1]}-[a-z0-9-]+\\.vercel\\.app$`).test(origin);
}

// 프론트 로컬 카드(방문이유 입력 등 서버가 안 만드는 표시용) 합성. 피드에 이어 붙인다.
function localCard(cardType: string, payload: Record<string, unknown>): CardMessage {
  return { id: `local-${crypto.randomUUID()}`, senderType: 'bot', messageType: 'card',
           content: null, payload: { card_type: cardType, ...payload } };
}

export function WebchatApp({ api, auth, hospitalPhone }: { api: WebchatApi; auth: WebAuth; hospitalPhone: string }) {
  const [open, setOpen] = useState(false);                 // 위젯 열림(홈페이지 host:setOpen과 위젯 런처가 공유)
  const [hasUnread, setHasUnread] = useState(false);       // 직원 답변 도착(닫힘 중 런처 ● 표시용)
  const [authAction, setAuthAction] = useState<PendingAction | null>(null);
  const [handoff, setHandoff] = useState<HandoffSummary | null>(null);
  const [reconfirm, setReconfirm] = useState<CardMessage | null>(null);
  const [doneCards, setDoneCards] = useState<CardMessage[]>([]); // 실행 결과 카드를 피드 끝에 쌓는다(재확인 카드/피드 카드 공통)
  const [flowCards, setFlowCards] = useState<CardMessage[]>([]); // 예약 앞흐름 카드(의사·날짜·시간·대상·방문이유·확인)를 피드에 이어 붙인다
  const [patientId, setPatientId] = useState<string | null>(null);

  // 마운트 통지 + 열림/미읽음 변화를 부모에 통지 + 부모의 host:setOpen 수신(origin 검증).
  const firstOpenPost = useRef(true);
  // 부모로 보낼 대상 origin. 초기엔 배포값(없으면 '*'), 신뢰된 수신으로 실제 부모(프리뷰 포함)를 알면 그리로 좁힌다
  // — 프리뷰 홈페이지에 얹혔을 때도 회신(열림 동기화·미읽음)이 실제 부모에 닿게 한다.
  const sendTargetRef = useRef(env.hostOrigin || '*');
  const toHost = (msg: { type: string; value?: boolean }) => {
    // 단독/테스트에선 window.parent === window라 자기 자신에게 가고(수신 리스너가 webchat:* 는 무시), iframe이면 홈페이지로 간다.
    window.parent.postMessage(msg, sendTargetRef.current);
  };
  useEffect(() => { toHost({ type: 'webchat:ready' }); }, []);
  useEffect(() => {
    // 마운트 초기값(open=false)은 통지하지 않는다 — 호스트가 막 연 창을 뒤늦게 닫는 경합을 막는다(실제 변화만 통지).
    if (firstOpenPost.current) { firstOpenPost.current = false; return; }
    toHost({ type: 'webchat:setOpen', value: open });
  }, [open]);
  useEffect(() => { toHost({ type: 'webchat:unread', value: hasUnread }); }, [hasUnread]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; value?: unknown } | null;
      if (!d || typeof d.type !== 'string' || !d.type.startsWith('host:')) return; // 호스트 메시지만(자기 webchat:* 루프백 무시)
      if (!matchesHostOrigin(e.origin, env.hostOrigin)) return;  // 배포 홈페이지 + 그 프리뷰만 신뢰
      if (e.origin) sendTargetRef.current = e.origin;            // 실제 부모(프리뷰 포함)를 알았으니 회신을 그리로 좁힌다
      if (d.type === 'host:setOpen') setOpen(Boolean(d.value));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const cardCtx = (slot: { send: (t: string) => void; onHandoff?: () => void }): CardContext => ({
    isAnonymous: !patientId,
    onAuthGate: setAuthAction,                               // 카드의 로그인 필요 행동 → 관문
    onHandoff: slot.onHandoff,                               // [직원에게 연결](WEBCHAT-NOANS) → 익명 인계 폼
    // [신청]/[취소] 확정 → 서버 실행 결과 카드(booking_done·cancel_done·실패 재확인)를 같은 대화 흐름의 다음 메시지로 피드에 삽입한다.
    // (CCARD-BOOKDONE-SHOW-01: 결과를 받은 뒤 한 번만 삽입 / 성공 위장 금지 — 서버가 준 실제 카드를 그대로 표시)
    onExecute: async (cardType, payload) => {
      const { result } = await api.executeCard({ cardType, payload, clientMessageId: crypto.randomUUID() });
      setReconfirm(null);
      setDoneCards((prev) => [...prev, result]);
    },
    onPick: slot.send,
    onReconsult: () => {}, onRebook: () => setAuthAction({ kind: 'book' }),
    // 예약 앞흐름 다음 단계 — 진료과·의사·날짜는 로그인 전 익명 통로(navigateAction),
    // 방문이유 카드는 로컬 삽입, 방문이유 확정은 로그인 후 확인 카드 재검증(book). 각 카드를 피드에 이어 붙인다.
    onNavigate: async (action) => {
      if (action.kind === 'pick_reason') {                     // 대상 선택 후 방문이유 입력(로컬 카드)
        setFlowCards((prev) => [...prev, localCard('reason_input', action.payload)]);
        return;
      }
      if (action.kind === 'submit_reason') {                   // 방문이유 확정 → 확인 카드(Bearer 재검증)
        const { card } = await api.revalidateAction({ action: { kind: 'book', payload: action.payload } });
        if (card) setFlowCards((prev) => [...prev, card]);
        return;
      }
      const { card } = await api.navigateAction({ action });   // pick_department·pick_doctor·pick_date(익명)
      if (card) setFlowCards((prev) => [...prev, card]);
    },
  });

  const afterAuth = async (pid: string, action: PendingAction) => {
    setPatientId(pid);
    setAuthAction(null);                                      // 로그인 자체는 성공 — 관문을 먼저 닫는다
    // 귀속·재검증은 ⑦(chat/attribute·cards/revalidate) 라우트에 의존한다. 아직 미배선(404)이라
    // 여기서 던져도 로그인은 성공으로 둔다(SP1 범위 = 로그인·patientId 확보까지). ⑦ 오면 실동작.
    try {
      await api.attributeSessionToAccount({ patientId: pid });  // WEBMOD-AUTH-09: 명시 인증에만 귀속
      if (action.kind === 'view_my_appointments') { await api.revalidateAction({ action }); return; } // WEBMOD-AUTH-07: 최신 조회
      if (action.kind === 'book' && !(action.payload && action.payload.for_patient_id)) {
        // 늦은 관문(④): 시간까지만 고른 상태(대상 미정) → 로그인 후 대상 선택부터. 확인 카드로 직행하지 않는다(WEBBOOK-07).
        const { card } = await api.revalidateAction({ action: { kind: 'pick_target', payload: action.payload ?? {} } });
        if (card) setFlowCards((prev) => [...prev, card]);
        return;
      }
      const { card } = await api.revalidateAction({ action });  // WEBMOD-AUTH-08 / BOOKCONF-03: 대상이 이미 정해진 재확인 카드(자동 실행 없음)
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
        renderCard={(payload, slot, interactive) => <WebCard payload={payload} ctx={cardCtx(slot)} interactive={interactive} />}
        extraCards={[...flowCards, ...doneCards]}             // 예약 앞흐름 카드 + 실행 결과 완료 카드를 피드 끝에 렌더(재열기해도 유지)
        // [WEBCHAT-NEW-01] 새 상담 = 완전한 새 출발 → 예약 흐름/완료 카드·재확인·로그인을 함께 비운다(카드 잔존 버그 수정).
        onReset={() => { setFlowCards([]); setDoneCards([]); setReconfirm(null); setPatientId(null); }}
      />
      {authAction && <AuthGateModal action={authAction} auth={auth} onClose={() => setAuthAction(null)} onAuthenticated={afterAuth} />}
      {handoff && <HandoffForm api={api} summary={handoff} onDone={() => setHandoff(null)} onCancel={() => setHandoff(null)} />}
      {reconfirm && (
        <div className="wc-scrim">
          <div role="dialog" aria-label="예약 재확인" className="wc-modal wc-modal--card">
            <WebCard payload={reconfirm.payload} ctx={cardCtx({ send: () => {} })} />
          </div>
        </div>
      )}
    </div>
  );
}
