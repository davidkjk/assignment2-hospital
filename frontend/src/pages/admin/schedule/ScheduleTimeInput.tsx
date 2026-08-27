import type { CSSProperties } from 'react'

// [SCHED-WEEK-05] 시각은 숫자로 친다 — `0900`→09:00. ⛔ 드롭다운(combobox)을 두지 않는다.
//   요구사항 :465 "키보드 입력이 편해야". QUEUE-WALK-14b~e와 같은 방식(콜론 없이 친다).
// 값 계약: value는 "HH:MM"(또는 ''), onChange도 "HH:MM"(또는 '')로 돌려준다.

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** 친 글자에서 숫자만 추려 "HH:MM"으로 — `0900`→`09:00`, `9`→`9`, `090`→`09:0`. 최대 4자리. */
export function formatTimeDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function ScheduleTimeInput({ label, value, onChange, disabled }: Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder="예: 0900"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(formatTimeDigits(e.target.value))}
      style={styles.input}
    />
  )
}

const styles: Record<string, CSSProperties> = {
  input: {
    height: 30,
    width: 64,
    padding: '0 6px',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    fontSize: 'var(--fs-base)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-ink)',
    background: 'var(--color-surface)',
  },
}
