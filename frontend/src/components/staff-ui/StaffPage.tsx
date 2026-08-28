import type { ReactNode } from 'react'

/** 화면 본문 래퍼 — 가운데 정렬 + 데모 꼬리말 */
export function StaffPage({
  children,
  max = 'max-w-6xl',
  footer = true,
  testid,
}: {
  children: ReactNode
  max?: string
  footer?: boolean
  testid?: string
}) {
  return (
    <div className={`mx-auto ${max} px-6 py-5`} data-testid={testid}>
      {children}
      {footer && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          데모 화면입니다 · 가짜 데이터로 정상 흐름을 보여 줍니다
        </p>
      )}
    </div>
  )
}
