import type { CSSProperties } from 'react'

export function NavBadge({ count, connected = true }: { count?: number; connected?: boolean }) {
  if (!count) return null
  return <span aria-label={connected ? `${count}건` : `${count}건, 연결 끊김`} style={{ marginLeft: 'auto', color: connected ? 'var(--color-warn)' : 'var(--color-gray-past)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], fontSize: 12 }}>{count}{!connected && <span title="연결 끊김"> ·</span>}</span>
}
