import { useState } from 'react';
import type { WebchatApi, CardMessage } from '../api/webchatApi';
import type { WebAuth } from '../auth/webAuth';
import { WebchatWidget, type PendingAction, type HandoffSummary } from './WebchatWidget';
import { AuthGateModal } from './AuthGateModal';
import { HandoffForm } from './HandoffForm';
import { WebCard, type CardContext } from './cards/WebCard';

export function WebchatApp({ api, auth, hospitalPhone }: { api: WebchatApi; auth: WebAuth; hospitalPhone: string }) {
  const [authAction, setAuthAction] = useState<PendingAction | null>(null);
  const [handoff, setHandoff] = useState<HandoffSummary | null>(null);
  const [reconfirm, setReconfirm] = useState<CardMessage | null>(null);
  const [doneCards, setDoneCards] = useState<CardMessage[]>([]); // 실행 결과 카드를 피드 끝에 쌓는다(재확인 카드/피드 카드 공통)
  const [patientId, setPatientId] = useState<string | null>(null);

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
        onAuthGate={setAuthAction}                            // WEBMOD-AUTH-01: 관문 열기(원래 행동·문맥 보존)
        onHandoffNeeded={setHandoff}
        renderCard={(payload, slot) => <WebCard payload={payload} ctx={cardCtx(slot.send)} />}
        extraCards={doneCards}                                // 실행 결과 완료 카드를 피드 끝에 렌더(재열기해도 유지)
      />
      {authAction && <AuthGateModal action={authAction} auth={auth} onClose={() => setAuthAction(null)} onAuthenticated={afterAuth} />}
      {handoff && <HandoffForm api={api} summary={handoff} onDone={() => setHandoff(null)} onCancel={() => setHandoff(null)} />}
      {reconfirm && (
        <div role="dialog" aria-label="예약 재확인">
          <WebCard payload={reconfirm.payload} ctx={cardCtx(() => {})} />
        </div>
      )}
    </div>
  );
}
