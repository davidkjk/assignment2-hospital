import type { CSSProperties, ReactNode } from 'react'

// [공용] 화면 상단 고지·경고 콜아웃 — 읽기전용 고지·병합 주의·이중기록 경계 등을 한 양식으로 통일(2026-08-30).
// 프레임(테두리·워시·여백)과 타이포(제목·설명)는 공통이고, 아이콘만 맥락별로 넘긴다
//   (ShieldCheck=읽기전용 · AlertTriangle=주의 · Bell=경계). 제목 없이 설명만(children) 넣어도 된다.
export function PageNotice({
  icon,
  title,
  children,
}: {
  icon?: ReactNode
  title?: string
  children: ReactNode
}) {
  return (
    <div style={styles.notice} role="note">
      {icon != null && (
        <span style={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <div style={styles.text}>
        {title != null && <div style={styles.title}>{title}</div>}
        <div style={styles.desc}>{children}</div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  notice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--sp-3)',
    margin: 0,
    padding: 'var(--sp-3) var(--sp-4)',
    borderRadius: 10,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-primary-wash)',
  },
  icon: { color: 'var(--color-primary)', flexShrink: 0, marginTop: 1, display: 'inline-flex' },
  text: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-0-5)' },
  title: {
    margin: 0,
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
  },
  desc: { margin: 0, color: 'var(--color-ink-muted)', fontSize: 'var(--fs-caption)', lineHeight: 1.5 },
}
