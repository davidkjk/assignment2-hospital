import type { CSSProperties } from 'react'

// [HSET-BOOK-05][HSET-SMS-01] 켜고 끄는 값은 체크박스가 아니라 스위치로 — 「지금 켜졌나」가 한눈에 읽힌다.
// 끌 수 있는 스위치다(양쪽 다 정상 상태). aria-label로 label 텍스트를 실어 getByLabelText가 잡는다.

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  'aria-label': string
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled, 'aria-label': label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        ...styles.track,
        background: checked ? 'var(--color-primary)' : 'var(--color-divider)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{ ...styles.knob, left: checked ? 22 : 2 }} />
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  track: {
    position: 'relative',
    width: 44,
    height: 24,
    flex: '0 0 44px',
    borderRadius: 999,
    border: 'none',
    padding: 0,
    transition: 'background 120ms ease',
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 1px 2px rgba(16,45,50,0.25)',
    transition: 'left 120ms ease',
  },
}
