import type { CSSProperties, ReactNode } from 'react'

// 대시보드·통계의 낱장 타일(`STAT-01`). 큰 숫자 + 그 밑의 이름표. 딥틸 콘솔의 각진 촘촘한 결.
// ⚠️ 이 숫자는 「되돌리기가 있는」 숫자다 — 상태를 되돌리면 값이 줄어든다(UNDO-STAT-01, Task 12·25 전제).
// 색만으로 뜻을 나르지 않는다(`DISP-COLOR-01`·요구사항 7절) — 톤을 줘도 이름표(글자)가 함께 있다.

type Tone = 'ink' | 'primary' | 'warn' | 'danger' | 'done'

const TONE_COLOR: Record<Tone, string> = {
  ink: 'var(--color-ink)',
  primary: 'var(--color-primary)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  done: 'var(--color-done)',
}

interface StatTileProps {
  value: ReactNode
  label: string
  tone?: Tone
  hint?: ReactNode
}

export function StatTile({ value, label, tone = 'ink', hint }: StatTileProps) {
  return (
    <div role="group" aria-label={label} style={styles.tile}>
      <div style={{ ...styles.value, color: TONE_COLOR[tone] }}>{value}</div>
      <div style={styles.label}>{label}</div>
      {hint && <div style={styles.hint}>{hint}</div>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  tile: {
    padding: '12px 14px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
    minWidth: 96,
  },
  value: { fontSize: 'var(--fs-num)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' },
  label: { marginTop: 4, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  hint: { marginTop: 2, fontSize: 'var(--fs-caption)', color: 'var(--color-gray-past)' },
}
