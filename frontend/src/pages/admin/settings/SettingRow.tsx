import type { CSSProperties, ReactNode } from 'react'

// 설정 한 줄 — 왼쪽에 라벨(+설명), 오른쪽 끝에 컨트롤. 진료 일정과 같은 관리자 화면 톤.
// 컨트롤을 오른쪽 끝에 두면 「무엇을 켜고 끄는지」와 「지금 값」이 시선 흐름으로 갈린다.

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={styles.row}>
      <div style={styles.labelCol}>
        <div style={styles.label}>{label}</div>
        {hint && <p style={styles.hint}>{hint}</p>}
      </div>
      <div style={styles.control}>{children}</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  row: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  labelCol: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 360 },
  label: { fontSize: 'var(--fs-base)', fontWeight: 600 },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  control: { flexShrink: 0, display: 'flex', alignItems: 'center' },
}
