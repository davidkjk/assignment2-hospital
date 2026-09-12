import type { CSSProperties, ReactNode } from 'react'

// 환자 상세의 모든 섹션이 같은 머리를 쓴다(2026-08-31 손검수, 매끈하게) — 작은 아이콘 각인 +
//   제목 + 건수(있으면). 각진 촘촘한 콘솔 결을 지키려 아이콘 각인은 담백한 회색 사각으로 두고,
//   색(딥틸)은 상태·동작에만 아껴 쓴다. 제목 h2는 순수 제목 텍스트만 담아 텍스트 조회를 깨지 않는다.

interface SectionHeadProps {
  icon: ReactNode
  title: string
  /** 건수 배지 — 0이나 미지정이면 감춘다. */
  count?: number
  /** 오른쪽 동작(가족 연결 추가·내부 메모 추가 등). */
  action?: ReactNode
}

export function SectionHead({ icon, title, count, action }: SectionHeadProps) {
  return (
    <div style={styles.head}>
      <div style={styles.left}>
        <span style={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <h2 style={styles.title}>{title}</h2>
        {count != null && count > 0 && <span style={styles.count}>{count}</span>}
      </div>
      {action}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', minHeight: 30,
  },
  left: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minWidth: 0 },
  icon: {
    display: 'grid', placeItems: 'center', width: 26, height: 26, flexShrink: 0,
    borderRadius: 7, background: 'var(--color-bg)', border: '1px solid var(--color-divider)',
    color: 'var(--color-ink-muted)',
  },
  title: {
    margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  count: {
    fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink-muted)', background: 'var(--color-bg)', border: '1px solid var(--color-divider)',
    borderRadius: 999, padding: '1px var(--sp-2)', minWidth: 22, textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
}
