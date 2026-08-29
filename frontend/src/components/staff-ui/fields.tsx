import type { ReactNode } from 'react'

// 직원 콘솔 공용 폼 프리미티브 — 네이티브 체크박스·인풋·셀렉트·텍스트영역을 딥틸 각진 톤으로 통일한다.
// ⚠️ 모두 **진짜 폼 요소를 감싸 시각만 바꾼다**(접근성·aria-label·role 보존 → getByLabelText/getByRole 유지).
// 크기·색 어휘는 SearchInput·buttons와 동일: border-input / focus:ring-ring / text-sm(= --fs-body, 17px 스케일).

const FIELD_BASE =
  'rounded-lg border border-input bg-card text-sm text-foreground outline-none transition-colors ' +
  'focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'

/** 텍스트 인풋 — 편집 가능함이 테두리로 보이게. */
export function TextField({
  value, onChange, disabled, placeholder, ariaLabel, type = 'text', className = '',
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  type?: string
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 px-3 ${FIELD_BASE} ${className}`}
    />
  )
}

/** 숫자 인풋(+단위) — 우측 정렬·tabular-nums로 값이 단위와 붙는다. 편집 가능함이 테두리로 보인다. */
export function NumberField({
  value, onChange, min, max, disabled, ariaLabel, suffix, width = 'w-20',
}: {
  value: number | string
  onChange: (raw: string) => void
  min?: number
  max?: number
  disabled?: boolean
  ariaLabel?: string
  suffix?: ReactNode
  width?: string
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 ${width} px-3 text-right tabular-nums ${FIELD_BASE}`}
      />
      {suffix != null && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </span>
  )
}

/** 커스텀 체크박스 — 네이티브 파란 기본 대신 딥틸. 진짜 input을 투명하게 덮어 클릭·포커스를 유지한다. */
export function Checkbox({
  checked, onChange, disabled, label, ariaLabel,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: ReactNode
  ariaLabel?: string
}) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <span
        className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors"
        style={{
          borderColor: checked ? 'var(--color-primary)' : 'var(--color-input)',
          background: checked ? 'var(--color-primary)' : 'var(--color-surface)',
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 m-0 opacity-0"
        />
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
            <path d="M2.5 6.2 5 8.6 9.5 3.6" stroke="var(--color-primary-foreground)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label != null && <span>{label}</span>}
    </label>
  )
}

/** 셀렉트 — 네이티브 화살표를 지우고 딥틸 쉐브론을 얹는다(진짜 select 유지). */
export function Select({
  value, onChange, disabled, ariaLabel, children, className = '',
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  ariaLabel?: string
  children: ReactNode
  className?: string
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 appearance-none pl-3 pr-9 ${FIELD_BASE} ${className}`}
      >
        {children}
      </select>
      <svg viewBox="0 0 12 12" className="pointer-events-none absolute right-3 h-3 w-3 text-muted-foreground" fill="none" aria-hidden="true">
        <path d="M2.5 4.5 6 8 9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** 텍스트영역 — 세로 리사이즈만, 딥틸 테두리. */
export function TextArea({
  value, onChange, disabled, ariaLabel, rows = 2, className = '',
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  ariaLabel?: string
  rows?: number
  className?: string
}) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 ${className}`}
    />
  )
}
