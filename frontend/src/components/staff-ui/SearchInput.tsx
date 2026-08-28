import type { ReactNode } from 'react'

/** 검색 입력(아이콘 포함).
 *  데모 `border-input`·`focus:border-ring`·`ring-ring`는 실 토큰에 미별칭 →
 *  `border-border`·`focus:border-primary`·`ring-primary`로 대체(포커스 링 유지). */
export function SearchInput({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  icon?: ReactNode
}) {
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-9 w-full rounded-lg border border-border bg-card ${
          icon ? 'pl-9' : 'pl-3'
        } pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30`}
      />
    </div>
  )
}
