import type { CSSProperties } from 'react'
import type { Settings } from '../../../api/settings'
import { NumberField } from '../../../components/staff-ui'
import { Toggle } from './Toggle'
import { SettingRow } from './SettingRow'

// [HSET-BOOK-*] 예약 규칙 — 취소 마감(0~168, HSETX-VALID-01)·앱 예약 자동확정 스위치(HSET-BOOK-05·06).
// 취소 마감은 「예약 마감」(의사·요일 시각, /admin/schedule)과 다른 값이다(HSET-BOOK-02) — 여기 없다.

interface Props {
  draft: Settings
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export function BookingRules({ draft, onChange }: Props) {
  const hours = draft.cancellation_deadline_hours
  return (
    <div style={styles.section}>
      <SettingRow
        label="취소 마감 시간"
        hint="예약 시각 기준 이 시간 전까지만 환자가 스스로 취소할 수 있습니다. 바꾸면 지금 잡힌 예약에도 즉시 적용됩니다."
      >
        <NumberField
          ariaLabel="취소 마감 시간"
          min={0}
          max={168}
          value={Number.isNaN(hours as number) ? '' : hours}
          onChange={(raw) => onChange('cancellation_deadline_hours', (raw === '' ? NaN : Number(raw)) as Settings['cancellation_deadline_hours'])}
          suffix="시간 전까지"
        />
      </SettingRow>

      <SettingRow
        label="앱 예약 자동확정"
        hint={draft.auto_confirm_app_bookings ? '앱에서 예약하면 바로 확정됩니다.' : '꺼짐 — 직원이 확인한 뒤 확정됩니다'}
      >
        <Toggle
          checked={draft.auto_confirm_app_bookings}
          onChange={(v) => onChange('auto_confirm_app_bookings', v)}
          aria-label="앱 예약 자동확정"
        />
      </SettingRow>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 24 },
}
