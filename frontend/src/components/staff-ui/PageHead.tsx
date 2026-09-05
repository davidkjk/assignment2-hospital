import type { ReactNode } from 'react'

/** 화면 안내 머리 — ⭐ 제목은 셸 헤더가 그린다(titleFor). 여기선 부제 + 우측 액션만.
 *  둘 다 없으면 빈 띠를 남기지 않는다(그 공간을 본문 정보에 넘긴다). title은 호환용(미사용). */
export function PageHead({ sub, action }: { title?: string; sub?: string; action?: ReactNode }) {
  if (!sub && !action) return null
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : <span />}
      {action}
    </div>
  )
}
