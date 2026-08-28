import type { ReactNode } from 'react'

/** 얇은 경계 + 미세 그림자 패널(= 환자상세 Section과 동일 체급).
 *  데모의 arbitrary shadow(0 1px 2px)는 실 토큰 `shadow-xs`(0 1px 2px/0.05)로 대체 — 시각 동일. */
export function Panel({
  title,
  action,
  children,
  className = '',
  pad = 'p-4',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  pad?: string
}) {
  return (
    <section className={`rounded-xl border border-border/70 bg-card ${pad} shadow-xs ${className}`}>
      {title && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
