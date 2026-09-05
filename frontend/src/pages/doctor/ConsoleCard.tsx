import type { CSSProperties, ReactNode } from 'react'

// [DOCTOR-CONTEXT-*] 가운데 「환자 맥락」 열의 공용 카드 — 데모 `Block`의 토큰판.
//   아이콘+볼드 제목 머리 + 본문. 세 섹션(예약 이유·사전문진·메모)이 한 세트로 읽히도록
//   경계선(1px)·모서리(--radius-card)·미세 그림자(--shadow-panel)를 하나로 맞춘다.
//   ⛔ 색·모서리·그림자는 토큰만 — 데모 shadow-[0_1px_2px_rgba(16,45,50,0.04)] = --shadow-panel.

interface ConsoleCardProps {
  icon?: ReactNode
  title: string
  /** 섹션 랜드마크 라벨(접근성). 없으면 제목 텍스트가 곧 라벨이 되도록 비워 둔다. */
  ariaLabel?: string
  children: ReactNode
}

export function ConsoleCard({ icon, title, ariaLabel, children }: ConsoleCardProps) {
  return (
    <section aria-label={ariaLabel} style={styles.card}>
      <h3 style={styles.head}>
        {icon && <span style={styles.icon} aria-hidden="true">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 'var(--sp-3)', background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-panel)',
  },
  head: {
    margin: '0 0 var(--sp-2)', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
    fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)',
  },
  icon: { display: 'inline-flex', color: 'var(--color-ink-muted)' },
}
