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

/** 완성된 HH:MM(00:00~23:59)인가. ⭐ 마스킹은 자리만 맞출 뿐 범위·완성도를 보장하지 않는다
 *  — `2599`→`25:99`, `095`→`09:5`, `9`→`9`가 그대로 만들어져 저장으로 넘어가면 서버가 422로 조용히 거절한다.
 *  저장 직전 이 자로 걸러 인라인 오류를 보인다(`SCHED-HOURS-11`). 빈 문자열은 여기선 false —
 *  「안 채움」을 허용할지는 호출부가 정한다(운영시간은 요일별로 빈 줄을 저장에서 건너뛴다). */
export function isValidHHMM(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

/** 시각 칸 형식 오류 문구 — 입력칸 placeholder(`예: 0900`)와 같은 어휘. */
export const TIME_FORMAT_ERROR = '시각을 0900처럼 4자리로 입력하세요'

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
