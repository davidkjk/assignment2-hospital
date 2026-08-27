import type { CSSProperties } from 'react'
import type { Settings } from '../../../api/settings'

// [HSET-WAIT-*] 대기실 운영 — 오래 대기 표시 체크 + 분 기준(1~180). 체크를 풀면 분 칸이 잠기고
// 값은 보존된다(HSET-WAIT-01·03). 이름에 「알림」을 쓰지 않고(HSET-WAIT-02), 꺼도 통계 집계는 계속된다(HSET-WAIT-04).

interface Props {
  draft: Settings
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  showLongWait: boolean
  setShowLongWait: (v: boolean) => void
}

export function WaitingRoom({ draft, onChange, showLongWait, setShowLongWait }: Props) {
  const minutes = draft.long_wait_threshold_minutes
  return (
    <div style={styles.section}>
      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          checked={showLongWait}
          onChange={(e) => setShowLongWait(e.target.checked)}
          aria-label="오래 기다리는 환자 표시"
        />
        <span>오래 기다리는 환자 표시</span>
      </label>

      <label style={styles.field}>
        <span>이 분 이상 기다리면 표시</span>
        <input
          type="number"
          min={1}
          max={180}
          disabled={!showLongWait}
          value={Number.isNaN(minutes as number) ? '' : minutes}
          onChange={(e) => onChange('long_wait_threshold_minutes', (e.target.value === '' ? NaN : Number(e.target.value)) as Settings['long_wait_threshold_minutes'])}
          aria-label="분 이상"
        />
      </label>
      <p style={styles.hint}>표시를 꺼도 기준 초과 대기 사례는 운영 통계에 계속 집계됩니다.</p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 240 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
