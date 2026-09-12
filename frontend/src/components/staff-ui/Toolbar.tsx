import type { ReactNode } from 'react'

/** 상단 필터/검색 툴바 (한 줄, 좌: 필터 · 우: 액션) */
export function Toolbar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
    </div>
  )
}
