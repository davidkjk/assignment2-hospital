import type { CSSProperties } from 'react'

// [SCHED-SAVE-02d] 세 층 공용 「아직 저장 안 됨」 점.
// 점이 붙는 곳이 셋이고 각각 다른 질문에 답한다 — 줄(어느 요일)·의사 이름(누구)·세로줄(어느 화면).
// ⛔ 세 층 모두 「같은 주황 점」을 쓴다 — 모양을 달리하면 뜻을 외워야 한다.
// ⚠️ 정본 토큰은 --color-warn 이다(--color-warning은 없다). 하드코딩 hex 금지.
//   기호는 규칙 원문이 그대로 쓰는 ●(U+25CF 기하 도형, 이모지 아님)이다.

export function DirtyDot() {
  return (
    <span data-dirty-dot role="img" aria-label="아직 저장 안 됨" style={styles.dot}>
      ●
    </span>
  )
}

const styles: Record<string, CSSProperties> = {
  dot: {
    color: 'var(--color-warn)',
    fontSize: 10,
    lineHeight: 1,
    marginLeft: 'var(--sp-1)',
    verticalAlign: 'middle',
  },
}
