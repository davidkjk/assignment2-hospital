import { useState, type CSSProperties } from 'react'
import { hospitalToday } from '../../lib/clock'

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


/** 프리셋 → 시작일·종료일. 종료일은 늘 오늘, 시작일만 과거로 채운다(PERIOD-BOX-02).
 *  ⭐ 「오늘」은 **병원 시계**다(`TIME-TZ-01`) — 그 PC 시계로 정하면 서버가 세는 기간과
 *     하루 어긋난 통계를 보게 된다.
 *  ⚠️ 달·해 셈은 UTC 자리에서 한다 — 로컬 Date로 옮기면 서머타임이 있는 지역에서 하루가 샌다. */
export function presetRange(key: PresetKey, at: Date = new Date()): { from: string; to: string } {
  const to = hospitalToday(at)
  const [y, m, d] = to.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  if (key === '7d') start.setUTCDate(start.getUTCDate() - 6)
  else if (key === '1m') start.setUTCMonth(start.getUTCMonth() - 1)
  else if (key === '3m') start.setUTCMonth(start.getUTCMonth() - 3)
  else if (key === '1y') start.setUTCFullYear(start.getUTCFullYear() - 1)
  else start.setUTCFullYear(2000, 0, 1) // 전체
  const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`
  return { from, to }
}

interface PeriodPickerProps {
  from: string
  to: string
  onChange: (next: { from: string; to: string }) => void
  onApply: () => void
  /** 시작일>종료일 등 범위 오류 문구(PERIOD-BOX-04). 입력은 지우지 않는다. */
  error?: string
  disabled?: boolean
  /** 조회 버튼 문구. 화면마다 다르다(통계=「통계 보기」, 열람 기록=「기간 조회」). 기본은 통계. */
  applyLabel?: string
}

export function PeriodPicker({ from, to, onChange, onApply, error, disabled, applyLabel = '통계 보기' }: PeriodPickerProps) {
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
        {applyLabel}
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
