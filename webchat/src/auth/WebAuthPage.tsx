import { useState } from 'react';

// 위젯 밖 별도 로그인 화면(WEBMOD-AUTH-03). 팝업으로 열려 전화+비번으로 로그인하고,
// 성공하면 opener(위젯)에게 patientId·세션을 postMessage로 넘긴 뒤 스스로 닫는다.
export type SignInResult = { session: unknown | null; error: string | null };

type Props = {
  signIn: (creds: { phone: string; password: string }) => Promise<SignInResult>;
  fetchPatientId: (accessToken: string) => Promise<string>;
  poster: (message: unknown, targetOrigin: string) => void;
  closeSelf: () => void;
  targetOrigin: string;
};

// 한국 휴대폰번호를 E.164(+82…)로 정규화. 이미 +로 시작하면 숫자만 남겨 유지.
export function toE164Kr(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');
  const digits = trimmed.replace(/\D/g, '');
  return '+82' + digits.replace(/^0/, '');
}

export function WebAuthPage({ signIn, fetchPatientId, poster, closeSelf, targetOrigin }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;                                          // WEBMOD-AUTH-04: 중복 제출 방지
    setBusy(true); setError(null);
    try {
      const result = await signIn({ phone: toE164Kr(phone), password });
      if (result.error || !result.session) {                  // WEBMOD-AUTH-05: 성공으로 닫지 않음
        setError(result.error ?? '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        setBusy(false);
        return;
      }
      const accessToken = (result.session as { access_token: string }).access_token;
      const patientId = await fetchPatientId(accessToken);
      poster({ source: 'webchat-auth', ok: true, patientId, session: result.session }, targetOrigin);
      closeSelf();
    } catch {
      setError('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      setBusy(false);
    }
  };

  return (
    <main role="main" aria-label="로그인" className="wa-page wc-root">
      <h1>가온병원 로그인</h1>
      <form onSubmit={submit} className="wa-form">
        <label htmlFor="wa-phone">전화번호</label>
        <input id="wa-phone" name="phone" type="tel" autoComplete="tel"
               inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy} />
        <label htmlFor="wa-password">비밀번호</label>
        <input id="wa-password" name="password" type="password" autoComplete="current-password"
               value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        <button type="submit" className="wc-btn wc-btn--primary" disabled={busy}>로그인</button>
      </form>
      <p className="wa-page__hint">가입은 가온병원 환자 앱에서 진행해 주세요.</p>
      {busy && <p role="status" className="wa-page__status">로그인 중입니다…</p>}
      {error && <p role="alert" className="wa-page__alert">{error}</p>}
    </main>
  );
}
