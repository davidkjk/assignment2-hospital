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

  const run = async (which: 'login' | 'signup') => {
    if (busy) return;                                           // WEBMOD-AUTH-04: 중복 제출·중복 실행 막기
    setBusy(true); setError(null);
    const outcome: AuthOutcome = which === 'login' ? await auth.login(action) : await auth.signup(action);
    setBusy(false);
    if (!outcome.ok) { setError(outcome.message); return; }     // WEBMOD-AUTH-05: 성공으로 닫지 않음(익명 상담 유지)
    onAuthenticated(outcome.patientId, action);                 // 자동 실행은 컨테이너가 하지 않는다(재확인 카드)
  };

  return (
    <div role="dialog" aria-label="로그인 또는 가입" aria-modal="true">
      <p>내 예약을 조회하거나 예약을 진행하려면 로그인이 필요합니다.</p>
      <button type="button" onClick={() => run('login')} disabled={busy}>로그인</button>
      <button type="button" onClick={() => run('signup')} disabled={busy}>가입</button>
      <button type="button" aria-label="닫기" onClick={onClose} disabled={busy}>×</button>
      {busy && <p role="status">인증을 확인하는 중입니다…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
