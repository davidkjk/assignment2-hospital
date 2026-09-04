export function GuideBanner({ active, text }: { active: boolean; text: string }) {
  if (!active) return null; // 갈래 종료 시 사라진다(WEBCHAT-GUIDE-02)
  return <div className="wc-guide" role="note" aria-label="진료과 추천 안내" data-pinned="true">{text}</div>;
}
