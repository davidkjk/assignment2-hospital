import type { ReactNode } from 'react'

/** 화면 본문 래퍼 — 가운데 정렬.
 *  ⚠️ 데모(`_ui.tsx`)에는 "데모 화면입니다 · 가짜 데이터로…" 꼬리말이 `footer = true` 기본으로 달려 있다.
 *  실 앱은 진짜 데이터를 쓰므로 그 문구를 그리지 않는다. `footer` prop은 데모에서 옮겨 온 화면이
 *  `footer={false}`를 넘겨도 컴파일되도록 시그니처만 남겨 둔다(그리는 것은 없다). */
export function StaffPage({
  children,
  max = 'max-w-6xl',
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
    </div>
  )
}
