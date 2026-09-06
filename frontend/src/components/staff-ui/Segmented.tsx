/** 세그먼트 탭 (상태별 필터)
 *  ⭐ 「하나의 컨트롤에 묶인 여러 버튼」으로 읽히게 한다 — 바깥 테두리 + 칸 사이 세로 구분선으로
 *  비활성 칸도 각자 경계를 가진 버튼으로 보인다(예전엔 배경이 페이지색과 같아 글자처럼 떠 보였다).
 *  활성 = 흰 칸 + 딥틸 글자·2px 밑줄로 선택 상태를 색이 아닌 무게로도 구분(색맹 대비).
 *  ⚠️ 활성엔 `bg-card`, 비활성엔 `bg-card`류 금지 — Segmented.test가 이 문자열로 상태를 가른다. */
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
    <div className="inline-flex divide-x divide-border overflow-hidden rounded-lg border border-border text-sm">
      {options.map((o) => {
        const n = count?.(o.key)
        const active = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`px-3 py-1.5 font-medium transition-colors ${
              active
                ? 'bg-card font-semibold text-primary shadow-[inset_0_-2px_0_var(--color-primary)]'
                : 'bg-muted text-muted-foreground hover:bg-white hover:text-foreground'
            }`}
          >
            {o.label}
            {n != null && (
              <span className={`ml-1.5 tabular-nums ${active ? 'text-primary/70' : 'text-muted-foreground'}`}>{n}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
