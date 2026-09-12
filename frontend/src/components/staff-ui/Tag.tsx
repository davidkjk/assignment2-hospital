import type { ReactNode } from 'react'

/** 옅은 태그(진료과·유형 등, 채도 낮은 안쪽 칩) */
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground ${className}`}>
      {children}
    </span>
  )
}
