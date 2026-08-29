// [SCHED-WEEK-05] 시각은 숫자로 친다 — `0900`→09:00. ⛔ 드롭다운(combobox)을 두지 않는다.
//   요구사항 :465 "키보드 입력이 편해야". QUEUE-WALK-14b~e와 같은 방식(콜론 없이 친다).
// 값 계약: value는 "HH:MM"(또는 ''), onChange도 "HH:MM"(또는 '')로 돌려준다.
// 스타일은 공용 폼 프리미티브(fields.tsx)와 같은 어휘 — 딥틸 테두리·포커스 링·tabular-nums.

// 진료 일정 전역 시각 입력 클래스(HospitalHoursTable의 여는/닫는 칸도 같은 클래스를 쓴다).
export const TIME_FIELD_CLASS =
  'h-9 w-16 rounded-lg border border-input bg-card px-2 text-center text-sm tabular-nums text-foreground ' +
  'outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:bg-muted disabled:text-muted-foreground'

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
      className={TIME_FIELD_CLASS}
    />
  )
}
