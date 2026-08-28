import type { ReactNode } from 'react'

/** 통계 숫자 타일.
 *  ⚠️ 데모판(직원 콘솔 밀도). 기존 `components/StatTile.tsx`와 경로로 분리 — 통합은 화면 포팅(S) 태스크.
 *  데모 arbitrary shadow는 실 토큰 `shadow-xs`로 대체(시각 동일). */
export function StatTile({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: ReactNode
  tone?: 'neutral' | 'teal' | 'amber' | 'sky' | 'violet' | 'green'
  hint?: string
}) {
  const ring: Record<string, string> = {
    neutral: 'text-foreground',
    teal: 'text-primary',
    amber: 'text-amber-600',
    sky: 'text-sky-600',
    violet: 'text-violet-600',
    green: 'text-emerald-600',
  }
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${ring[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
