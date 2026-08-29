import type { CSSProperties } from 'react'
import type { Settings } from '../../../api/settings'
import { Checkbox, NumberField } from '../../../components/staff-ui'
import { SettingRow } from './SettingRow'

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
      <SettingRow
        label="오래 기다리는 환자 표시"
        hint="오래 기다린 환자를 「지금 처리할 것」에 카드로 띄웁니다. 환자에게 알림을 보내지는 않습니다. 표시를 꺼도 기준 초과 대기 사례는 운영 통계에 계속 집계됩니다."
      >
        <span style={styles.control}>
          <Checkbox
            checked={showLongWait}
            onChange={setShowLongWait}
            ariaLabel="오래 기다리는 환자 표시"
          />
          <NumberField
            min={1}
            max={180}
            disabled={!showLongWait}
            value={Number.isNaN(minutes as number) ? '' : minutes}
            onChange={(raw) => onChange('long_wait_threshold_minutes', (raw === '' ? NaN : Number(raw)) as Settings['long_wait_threshold_minutes'])}
            ariaLabel="분 이상"
            suffix="분 이상"
          />
        </span>
      </SettingRow>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 24 },
  control: { display: 'inline-flex', alignItems: 'center', gap: 12 },
}
