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
  const [patientId, setPatientId] = useState<string | null>(null);

  const cardCtx = (send: (t: string) => void): CardContext => ({
    isAnonymous: !patientId,
    onAuthGate: setAuthAction,                               // 카드의 로그인 필요 행동 → 관문
    onExecute: async (cardType, payload) => { const { result } = await api.executeCard({ cardType, payload, clientMessageId: crypto.randomUUID() }); setReconfirm(null); void result; },
    onPick: send,
    onReconsult: () => {}, onRebook: () => setAuthAction({ kind: 'book' }),
  });

  const afterAuth = async (pid: string, action: PendingAction) => {
    setPatientId(pid);
    await api.attributeSessionToAccount({ patientId: pid });  // WEBMOD-AUTH-09: 명시 인증에만 귀속
    setAuthAction(null);
    if (action.kind === 'view_my_appointments') { await api.revalidateAction({ action }); return; } // WEBMOD-AUTH-07: 최신 조회
    const { card } = await api.revalidateAction({ action });  // WEBMOD-AUTH-08 / BOOKCONF-03: 재확인 카드(자동 실행 없음)
    setReconfirm(card);
  };

  return (
    <div id="webchat-app" role="region" aria-label="AI 상담봇">
      <WebchatWidget
        api={api} hospitalPhone={hospitalPhone}
        onAuthGate={setAuthAction}                            // WEBMOD-AUTH-01: 관문 열기(원래 행동·문맥 보존)
        onHandoffNeeded={setHandoff}
        renderCard={(payload, slot) => <WebCard payload={payload} ctx={cardCtx(slot.send)} />}
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
