import type { ReactNode } from 'react'

/** 얇은 경계 + 미세 그림자 패널(= 환자상세 Section과 동일 체급).
 *  그림자는 데모 원본값을 토큰으로 옮긴 `shadow-panel`(0 1px 2px rgba(16,45,50,.04)). */
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
    <section className={`rounded-xl border border-border/70 bg-card ${pad} shadow-panel ${className}`}>
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
