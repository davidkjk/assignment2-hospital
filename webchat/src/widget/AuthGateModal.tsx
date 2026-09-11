import { useState } from 'react';
import type { WebAuth, AuthOutcome } from '../auth/webAuth';
import type { PendingAction } from './WebchatWidget';

type Props = {
  action: PendingAction;
  auth: WebAuth;
  onClose: () => void;                                          // WEBMOD-AUTH-06: 원래 행동 실행 안 함
  onAuthenticated: (patientId: string, action: PendingAction) => void; // 성공 → 컨테이너가 재검증/귀속
};

export function AuthGateModal({ action, auth, onClose, onAuthenticated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 로그인만 지원한다(사용자 결정 2026-09-11). 가입은 웹에서 만들지 않고 환자 앱에서 하므로 [가입] 버튼을 두지 않는다.
  //   ~~WEBMOD-AUTH-03: [가입]→기존 가입 흐름 연결~~ ✅ 해소 — 버튼 제거, 계정 없는 분은 아래 안내로 앱으로 보낸다(막다른 길 금지).
  const run = async () => {
    if (busy) return;                                           // WEBMOD-AUTH-04: 중복 제출·중복 실행 막기
    setBusy(true); setError(null);
    const outcome: AuthOutcome = await auth.login(action);
    setBusy(false);
    if (!outcome.ok) { setError(outcome.message); return; }     // WEBMOD-AUTH-05: 성공으로 닫지 않음(익명 상담 유지)
    onAuthenticated(outcome.patientId, action);                 // 자동 실행은 컨테이너가 하지 않는다(재확인 카드)
  };

  return (
    <div className="wc-scrim">
      <div role="dialog" aria-label="로그인" aria-modal="true" className="wc-modal wc-modal--auth">
        <button type="button" aria-label="닫기" className="wc-modal__close" onClick={onClose} disabled={busy}>×</button>
        <p className="wc-modal__lead">내 예약을 조회하거나 예약을 진행하려면 로그인이 필요합니다.</p>
        <div className="wc-modal__actions">
          <button type="button" className="wc-btn wc-btn--primary" onClick={run} disabled={busy}>로그인</button>
        </div>
        {/* 계정이 없는 분을 막다른 길에 두지 않는다 — 가입 경로(환자 앱)를 알려 준다. */}
        <p className="wc-modal__hint">가온병원 계정이 없으신가요? 가온병원 앱에서 가입한 뒤 로그인해 주세요.</p>
        {busy && <p role="status" className="wc-modal__status">로그인을 확인하는 중입니다…</p>}
        {error && <p role="alert" className="wc-modal__alert">{error}</p>}
      </div>
    </div>
  );
}
