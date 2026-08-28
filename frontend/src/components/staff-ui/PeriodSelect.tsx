/** 기간 선택기 — 날짜 칸이 늘 보이고, 프리셋을 고르면 그 날짜로 맞춰진다(PERIOD-BOX-01~04).
 *  날짜를 직접 고치면 프리셋 표시가 「직접 입력」으로 바뀐다.
 *
 *  데모(`_ui.tsx:55`)와 다른 점 둘 — 둘 다 실 앱이라 필요한 것이다:
 *   ① 데모는 오늘을 `2026-08-22`로 박아 두고 프리셋 시작일도 상수표였다 → 여기선 `today`에서 계산한다.
 *   ② 데모는 자기 안에 상태를 들고 있었다(표시만) → 여기선 부모가 값을 쥐고 서버 조회에 쓴다(controlled).
 *  마크업·className은 데모 그대로다. */

export const PERIOD_PRESETS = ['최근 7일', '최근 30일', '최근 90일', '최근 1년', '전체'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]
export const PERIOD_CUSTOM = '직접 입력'

export interface PeriodValue {
  /** 프리셋 이름, 또는 날짜를 직접 고쳤을 때의 `직접 입력` */
  preset: PeriodPreset | typeof PERIOD_CUSTOM
  /** `YYYY-MM-DD` */
  from: string
  /** `YYYY-MM-DD` */
  to: string
}

/** 프리셋별 「오늘로부터 며칠 전」. `전체`는 시작일을 두지 않는다(서비스 시작일 대신 빈 값). */
const PRESET_DAYS: Record<PeriodPreset, number | null> = {
  '최근 7일': 6,
  '최근 30일': 30,
  '최근 90일': 90,
  '최근 1년': 365,
  전체: null,
}

function isoToday(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function shiftDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() - days)
  return base.toISOString().slice(0, 10)
}

/** 프리셋 하나를 오늘 기준 날짜 범위로 편다. 화면 밖(조회 훅)에서도 쓸 수 있게 내보낸다. */
export function periodRange(preset: PeriodPreset, today = isoToday()): PeriodValue {
  const days = PRESET_DAYS[preset]
  return { preset, from: days == null ? '' : shiftDays(today, days), to: today }
}

const dateCls =
  'h-9 rounded-lg border border-input bg-card px-2 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'

export function PeriodSelect({
  value,
  onChange,
  today,
}: {
  value: PeriodValue
  onChange: (next: PeriodValue) => void
  /** 테스트·고정 시연용. 기본은 실제 오늘. */
  today?: string
}) {
  const custom = value.preset === PERIOD_CUSTOM
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.preset}
        onChange={(e) => {
          const key = e.target.value
          if (key === PERIOD_CUSTOM) return // 직접 입력은 날짜 칸을 고쳐서만 들어간다(고를 수 없음)
          onChange(periodRange(key as PeriodPreset, today))
        }}
        className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
        aria-label="조회 기간"
      >
        {PERIOD_PRESETS.map((k) => (
          <option key={k}>{k}</option>
        ))}
        {/* 날짜를 직접 고치면 이 항목이 선택된 상태로만 나타난다(목록에서 고를 수는 없음) */}
        {custom && <option value={PERIOD_CUSTOM}>{PERIOD_CUSTOM}</option>}
      </select>
      <span className="flex items-center gap-1.5">
        <input
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ preset: PERIOD_CUSTOM, from: e.target.value, to: value.to })}
          className={dateCls}
          aria-label="시작일"
        />
        <span className="text-sm text-muted-foreground">–</span>
        <input
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ preset: PERIOD_CUSTOM, from: value.from, to: e.target.value })}
          className={dateCls}
          aria-label="종료일"
        />
      </span>
    </div>
  )
}
