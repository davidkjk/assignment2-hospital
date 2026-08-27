import type { CSSProperties } from 'react'
import type { BotMetrics } from '../../api/stats'

// [STAT-METRIC-06] 상담봇 지표 — 문의 수·자체 안내·직원 연결·많이 들어온 질문.
// ⭐ 0건과 미집계는 다르다 — 계약이 없으면 0으로 위장하지 않고 「현재 집계할 수 없음」으로 그린다.
//    예약 수와 섞지 않는다.

const UNAVAILABLE = '현재 집계할 수 없음'

export function BotMetricCard({ bot }: { bot: BotMetrics | null }) {
  return (
    <section aria-label="상담봇 지표" style={styles.card}>
      <h3 style={styles.title}>상담봇 지표</h3>
      <p style={styles.note}>예약 수와 섞지 않고 별도로 집계합니다.</p>
      <dl style={styles.list}>
        <Row label="총 문의" value={bot ? `${bot.total_inquiries.toLocaleString()}건` : UNAVAILABLE} />
        <Row label="상담봇 자체 안내" value={bot ? `${bot.self_served.toLocaleString()}건` : UNAVAILABLE} />
        <Row label="직원 연결" value={bot ? `${bot.handoff.toLocaleString()}건` : UNAVAILABLE} />
        <Row
          label="많이 들어온 질문"
          value={bot && bot.top_questions && bot.top_questions.length > 0 ? bot.top_questions[0] : UNAVAILABLE}
        />
      </dl>
      {!bot && (
        <p style={styles.foot}>상담봇 집계 계약이 아직 없어 0으로 위장하지 않고 그대로 표시합니다.</p>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  const unavailable = value === UNAVAILABLE
  return (
    <div style={styles.row}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={{ ...styles.dd, ...(unavailable ? styles.ddMuted : null) }}>{value}</dd>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    padding: 16,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    boxShadow: 'var(--shadow-card)',
  },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  note: { margin: '2px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  list: { margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--fs-base)' },
  dt: { margin: 0, color: 'var(--color-ink-muted)' },
  dd: { margin: 0, fontWeight: 600, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' },
  ddMuted: { fontWeight: 400, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  foot: { margin: '10px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
