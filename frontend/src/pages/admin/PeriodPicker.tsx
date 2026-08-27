import { useState, type CSSProperties } from 'react'

// [PERIOD-*] 기간 선택기 — 전역 규칙(직원 웹). 기간으로 조회하는 화면 전부가 같은 부품을 쓴다.
// ⭐ 날짜 두 칸이 늘 보인다(PERIOD-BOX-01) — 프리셋을 고르든 안 고르든 지금 조회 범위가 날짜로 드러난다.
//    프리셋 5종(PERIOD-BOX-02)은 종료일=오늘로 맞추고 시작일을 과거로 채운다. '직접 입력'은
//    드롭다운 항목이 아니라(PERIOD-BOX-03·05) 날짜를 손보면 저절로 나타나는 상태 표시일 뿐이다.
//    시작일>종료일·한쪽 비면 조회하지 않는다(PERIOD-BOX-04) — 부모가 error로 이유를 준다.

export type PresetKey = '7d' | '1m' | '3m' | '1y' | 'all'

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '최근 7일' },
  { key: '1m', label: '최근 1개월' },
  { key: '3m', label: '최근 3개월' },
  { key: '1y', label: '최근 1년' },
  { key: 'all', label: '전체' },
]

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 프리셋 → 시작일·종료일. 종료일은 늘 오늘, 시작일만 과거로 채운다(PERIOD-BOX-02). */
export function presetRange(key: PresetKey, today = new Date()): { from: string; to: string } {
  const to = ymd(today)
  const start = new Date(today)
  if (key === '7d') start.setDate(start.getDate() - 6)
  else if (key === '1m') start.setMonth(start.getMonth() - 1)
  else if (key === '3m') start.setMonth(start.getMonth() - 3)
  else if (key === '1y') start.setFullYear(start.getFullYear() - 1)
  else start.setFullYear(2000, 0, 1) // 전체
  return { from: ymd(start), to }
}

interface PeriodPickerProps {
  from: string
  to: string
  onChange: (next: { from: string; to: string }) => void
  onApply: () => void
  /** 시작일>종료일 등 범위 오류 문구(PERIOD-BOX-04). 입력은 지우지 않는다. */
  error?: string
  disabled?: boolean
}

export function PeriodPicker({ from, to, onChange, onApply, error, disabled }: PeriodPickerProps) {
  // 프리셋을 고르면 그 키를, 날짜를 손보면 'custom'을 기억한다(상태 표시용).
  const [presetKey, setPresetKey] = useState<PresetKey | 'custom' | ''>('')

  function pickPreset(key: PresetKey) {
    setPresetKey(key)
    onChange(presetRange(key))
  }
  function editDate(field: 'from' | 'to', value: string) {
    setPresetKey('custom')
    onChange({ from, to, [field]: value })
  }

  return (
    <div style={styles.wrap}>
      <label style={styles.field}>
        <span style={styles.fieldLabel}>시작일</span>
        <input
          type="date"
          aria-label="시작일"
          value={from}
          max={to || undefined}
          disabled={disabled}
          onChange={(e) => editDate('from', e.target.value)}
          style={styles.date}
        />
      </label>
      <span aria-hidden="true" style={styles.tilde}>~</span>
      <label style={styles.field}>
        <span style={styles.fieldLabel}>종료일</span>
        <input
          type="date"
          aria-label="종료일"
          value={to}
          min={from || undefined}
          disabled={disabled}
          onChange={(e) => editDate('to', e.target.value)}
          style={styles.date}
        />
      </label>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>빠른 기간</span>
        <select
          aria-label="빠른 기간"
          value={presetKey === 'custom' || presetKey === '' ? '' : presetKey}
          disabled={disabled}
          onChange={(e) => pickPreset(e.target.value as PresetKey)}
          style={styles.select}
        >
          <option value="" disabled>
            기간 선택
          </option>
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {/* '직접 입력'은 고를 수 있는 항목이 아니라 상태 표시일 뿐이다(PERIOD-BOX-03). */}
      {presetKey === 'custom' && (
        <span style={styles.customTag} data-testid="period-custom">
          직접 입력
        </span>
      )}

      <button type="button" onClick={onApply} disabled={disabled} style={styles.apply}>
        통계 보기
      </button>

      {error && (
        <span role="alert" style={styles.error}>
          {error}
        </span>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
    padding: '12px 14px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)' },
  tilde: { paddingBottom: 8, color: 'var(--color-ink-muted)' },
  date: {
    height: 34,
    padding: '0 8px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    fontVariantNumeric: 'tabular-nums',
  },
  select: {
    height: 34,
    padding: '0 8px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  customTag: {
    alignSelf: 'center',
    padding: '3px 8px',
    borderRadius: 6,
    background: 'var(--color-primary-wash)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
  },
  apply: {
    height: 34,
    padding: '0 16px',
    border: '1px solid var(--color-primary)',
    borderRadius: 8,
    background: 'var(--color-primary)',
    color: 'var(--color-surface)',
    fontSize: 'var(--fs-base)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  error: {
    alignSelf: 'center',
    color: 'var(--color-danger)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
  },
}
