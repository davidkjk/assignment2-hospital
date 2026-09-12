import { useState } from 'react';
import type { WebchatApi } from '../api/webchatApi';
import type { HandoffSummary } from './WebchatWidget';

type Props = { api: WebchatApi; summary: HandoffSummary; onDone: () => void; onCancel: () => void };

export function HandoffForm({ api, summary, onDone, onCancel }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ name?: string; phone?: string; submit?: string }>({});

  const submit = async () => {
    if (busy) return;                                                  // WEBANON-HANDOFF-06: 중복 티켓 방지
    const next: typeof err = {};
    if (!name.trim()) next.name = '이름을 입력해 주세요';                // WEBANON-HANDOFF-02·04
    if (phone.trim() && !/^0\d{9,10}$/.test(phone.trim())) next.phone = '전화번호 형식을 확인해 주세요'; // 04
    if (next.name || next.phone) { setErr(next); return; }             // 유효한 다른 값·대화 문맥 유지
    setBusy(true); setErr({});
    try {
      await api.createHandoffTicket({ threadId: summary.threadId, name: name.trim(), phone: phone.trim() || null, summary: summary.summary }); // 05
      onDone();                                                        // 08: WEBCHAT-ROOM 복귀 + HANDOFF 상태
    } catch {
      setBusy(false);
      setErr({ submit: '상담 연결에 실패했습니다. 다시 시도해 주세요' }); // 07: 성공처럼 표시 안 함·입력 보존
    }
  };

  return (
    <div className="wc-scrim">
      <div role="form" aria-label="직원 상담 연결" className="wc-modal wc-form">
        {/* 01: 기존 대화 요약과 연결 — 처음부터 다시 설명시키지 않음 */}
        {summary.summary.length > 0 && <p className="wc-form__intro">지금까지 나눈 상담 내용을 직원에게 함께 전달합니다.</p>}
        <label className="wc-field">이름<input className="wc-field__input" aria-label="이름" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {err.name && <p role="alert" className="wc-field__err">{err.name}</p>}
        {/* 03: 전화번호는 직원 답변 문자 수신용으로만 선택 입력받고 그 목적을 알린다 */}
        <label className="wc-field">전화번호(선택)<input className="wc-field__input" aria-label="전화번호" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <p className="wc-form__note">입력한 번호는 <b>직원 답변 문자를 받기 위한 용도로만</b> 사용합니다.</p>
        {err.phone && <p role="alert" className="wc-field__err">{err.phone}</p>}
        <div className="wc-form__actions">
          <button type="button" className="wc-btn wc-btn--primary" onClick={submit} disabled={busy}>상담 연결</button>
          <button type="button" className="wc-btn wc-btn--ghost" onClick={onCancel} disabled={busy}>그만두기</button>
        </div>
        {busy && <p role="status" className="wc-form__status">상담을 연결하는 중입니다…</p>}
        {err.submit && <p role="alert" className="wc-form__alert">{err.submit}</p>}
        {/* 09: 다른 기기 이어보기 경로를 제공하지 않는다(같은 브라우저 토큰만 복원) */}
      </div>
    </div>
  );
}
