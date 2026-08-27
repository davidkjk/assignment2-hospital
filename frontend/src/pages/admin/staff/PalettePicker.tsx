import type { CSSProperties } from 'react'

// [CAL-COLOR-01~09·12·STAFF-PROFILE-11] 캘린더 색 고르개 — 재사용 컴포넌트.
// ⭐ 고르기만 하고 색을 만들지 못한다(팔레트 10색·인덱스 참조). 사용중인 색도 고를 수 있고
//    (막다른 길 금지·CAL-COLOR-07), 같은 진료과에서 겹치면 그 자리에서 알린다.
// ⭐ 저장하는 것은 색값이 아니라 「팔레트의 몇 번째」다(CAL-COLOR-09) — value는 0~9 인덱스.
// 칩은 캘린더에서 보일 그 모습(면 색 배경 + 진한 글자, CAL-COLOR-12)이라 고를 근거가 된다.

const PALETTE_SIZE = 10

interface PalettePickerProps {
  value: number | null
  onChange(index: number): void
  /** 다른 의사가 이미 쓰는 색 — 「사용중」이라 적되 막지 않는다(CAL-COLOR-07). */
  usedIndices?: number[]
  /** 같은 진료과에서 겹치는 색 — 고르면 읽기 어려워진다고 알린다(CAL-COLOR-07). */
  conflictIndices?: number[]
}

export function PalettePicker({ value, onChange, usedIndices = [], conflictIndices = [] }: PalettePickerProps) {
  const used = new Set(usedIndices)
  const conflict = new Set(conflictIndices)
  const showWarning = value !== null && conflict.has(value)

  return (
    <fieldset role="group" aria-label="캘린더 색" style={styles.group}>
      <div style={styles.swatches}>
        {Array.from({ length: PALETTE_SIZE }, (_, i) => {
          const selected = value === i
          const inUse = used.has(i)
          return (
            <label
              key={i}
              data-swatch={i}
              style={{
                ...styles.swatch,
                background: `var(--doctor-palette-${i}-fill)`,
                color: `var(--doctor-palette-${i})`,
                outline: selected ? '2px solid var(--color-ink)' : '1px solid var(--color-divider)',
                outlineOffset: selected ? 1 : 0,
              }}
            >
              <input
                type="radio"
                name="calendar-color"
                value={i}
                checked={selected}
                onChange={() => onChange(i)}
                aria-label={`색 ${i + 1}${inUse ? ' 사용중' : ''}`}
                style={styles.radio}
              />
              <span aria-hidden="true" style={styles.dot} />
              {inUse && <span style={styles.usedTag}>사용중</span>}
            </label>
          )
        })}
      </div>
      <p data-palette-note style={styles.note}>
        이 색은 모든 직원의 화면에서 함께 바뀝니다
      </p>
      {showWarning && (
        <p data-palette-warning role="alert" style={styles.warning}>
          같은 진료과에서 겹치면 읽기 어려워집니다
        </p>
      )}
    </fieldset>
  )
}

const styles: Record<string, CSSProperties> = {
  group: { border: 'none', margin: 0, padding: 0 },
  swatches: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  swatch: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 34,
    height: 30,
    padding: '0 8px',
    borderRadius: 7,
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  // 라디오 자체는 시각적으로 감추고 칩 전체를 누르게 한다(칩이 곧 캘린더 모습이다).
  radio: { position: 'absolute', opacity: 0, width: 1, height: 1, margin: 0 },
  dot: { width: 12, height: 12, borderRadius: '50%', background: 'currentColor' },
  usedTag: { fontSize: 10, fontWeight: 700 },
  note: { margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  warning: { margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-warn)', fontWeight: 600 },
}
