import type { CSSProperties, ReactNode } from 'react'

// [SCHED-TAB-01d] 진료 일정 관리의 다섯 탭이 공유하는 겉 카드.
//   ⭐ 탭마다 「맨 위에 오는 것」(카드/제목/칩/달력)이 제각각이면 오른쪽 내용의 윗선이
//   왼쪽 세로줄 첫 카드와 어긋난다 → 모든 탭을 같은 프레임으로 감싸 윗선·테두리·그림자를 맞춘다.
//   머리(제목+동작) → (선택) 도구줄(칩·범례) → 본문. 표는 pad 없이 가장자리까지, 폼은 pad로 여백.

interface PanelCardProps {
  title: string
  /** 머리 오른쪽 버튼(예: 진료과 추가). */
  action?: ReactNode
  /** 제목 아래 한 줄 — 의사 칩·범례처럼 내용을 고르거나 읽는 도구. */
  toolbar?: ReactNode
  /** 본문 좌우·상하 여백. 표는 false(가장자리까지), 폼·목록은 true. */
  pad?: boolean
  children: ReactNode
}

export function PanelCard({ title, action, toolbar, pad = false, children }: PanelCardProps) {
  return (
    <section style={styles.card}>
      <header style={styles.head}>
        <h2 style={styles.title}>{title}</h2>
        {action && <div style={styles.action}>{action}</div>}
      </header>
      {toolbar && <div style={styles.toolbar}>{toolbar}</div>}
      <div style={pad ? styles.bodyPad : styles.body}>{children}</div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-surface)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--sp-3)',
    minHeight: 28,
    padding: 'var(--sp-3) var(--sp-4)',
    borderBottom: '1px solid var(--color-divider)',
  },
  title: {
    margin: 0,
    fontSize: 'var(--fs-section)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    color: 'var(--color-ink)',
  },
  action: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--sp-2) var(--sp-4)',
    padding: 'var(--sp-3) var(--sp-4)',
    borderBottom: '1px solid var(--color-divider)',
  },
  body: {},
  bodyPad: { padding: 'var(--sp-4)' },
}
