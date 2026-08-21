/**
 * 폰 상단 상태바 — 진짜 휴대폰처럼 시간·신호·와이파이·배터리를 맨 위에 둔다.
 * 목업 실감용 장식이라 값은 고정(9:41)이고, 아이콘은 이모지 금지 규칙에 따라 인라인 SVG로 그린다.
 */
export function StatusBar() {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between bg-background px-6 pt-1 text-foreground">
      <span className="text-sm font-semibold tabular-nums">9:41</span>
      <div className="flex items-center gap-1.5">
        {/* 신호 세기 */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
          <rect x="0" y="8" width="3" height="4" rx="0.6" />
          <rect x="5" y="5" width="3" height="7" rx="0.6" />
          <rect x="10" y="2.5" width="3" height="9.5" rx="0.6" />
          <rect x="15" y="0" width="3" height="12" rx="0.6" />
        </svg>
        {/* 와이파이 */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
          <path d="M8 11.4a1.4 1.4 0 100-2.8 1.4 1.4 0 000 2.8z" />
          <path d="M8 6.1c1.5 0 2.9.6 3.9 1.6l1.2-1.3A7.4 7.4 0 008 4.3a7.4 7.4 0 00-5.1 2.1l1.2 1.3A5.4 5.4 0 018 6.1z" />
          <path d="M8 1.4A11 11 0 00.4 4.5l1.2 1.3A9.2 9.2 0 018 3.1c2.5 0 4.8.9 6.4 2.7l1.2-1.3A11 11 0 008 1.4z" />
        </svg>
        {/* 배터리 */}
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor" />
          <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </div>
    </div>
  )
}
