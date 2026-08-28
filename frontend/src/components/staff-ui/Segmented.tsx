/** 세그먼트 탭 (상태별 필터 pill) */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  count,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
  count?: (k: T) => number | undefined
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
      {options.map((o) => {
        const n = count?.(o.key)
        const active = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.label}
            {n != null && <span className="ml-1.5 tabular-nums text-muted-foreground">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
