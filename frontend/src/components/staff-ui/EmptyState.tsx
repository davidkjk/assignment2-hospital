import type { ReactNode } from 'react'

/** 빈 상태 — 막다른 길을 만들지 않는다(할 일 안내).
 *  ⚠️ 데모판(직원 콘솔 밀도). 기존 `components/EmptyState.tsx`와 경로로 분리 — 통합은 화면 포팅(S) 태스크. */
export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</div>}
      <div className="font-medium">{title}</div>
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </div>
  )
}
