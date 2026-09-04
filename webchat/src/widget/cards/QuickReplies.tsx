import type { CardProps } from './WebCard';

// ── WEBCARD-QUICK ── CCARD-QUICK 본체(시작 고정·대화 중 3~4개·진단/처방 금지) + 전송 연결 + 자유 입력 항상 열림
export function QuickReplies({ p, ctx }: CardProps) {
  const state = p.state as string | undefined;
  if (state === '생성중' || state === '생성실패') return null; // 별도 로딩·실패·재시도 UI 없음(자유 입력은 ChatRoom이 연다)
  const options = (p.options as string[] | undefined) ?? [];
  if (options.length === 0) return null;
  return (
    <div className="wc-quick" aria-label="빠른 답변">
      {options.map((o) => (
        <button key={o} type="button" className="wc-chip" onClick={() => ctx.onPick(o)}>{o}</button> // 버튼 문장 그대로 환자 말풍선 전송
      ))}
    </div>
  );
}
