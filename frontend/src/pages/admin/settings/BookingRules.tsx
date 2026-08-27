import type { CSSProperties } from 'react'
import type { Settings } from '../../../api/settings'

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
      <label style={styles.field}>
        <span>취소 마감(시간)</span>
        <input
          type="number"
          min={0}
          max={168}
          value={Number.isNaN(hours as number) ? '' : hours}
          onChange={(e) => onChange('cancellation_deadline_hours', (e.target.value === '' ? NaN : Number(e.target.value)) as Settings['cancellation_deadline_hours'])}
        />
      </label>
      <p style={styles.hint}>예약 시각 기준 이 시간 전까지만 환자가 스스로 취소할 수 있습니다. 바꾸면 지금 잡힌 예약에도 즉시 적용됩니다.</p>

      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          checked={draft.auto_confirm_app_bookings}
          onChange={(e) => onChange('auto_confirm_app_bookings', e.target.checked)}
          aria-label="앱 예약 자동확정"
        />
        <span>앱 예약 자동확정</span>
      </label>
      {!draft.auto_confirm_app_bookings && (
        <p style={styles.warn}>꺼짐 — 직원이 확인한 뒤 확정됩니다</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  warn: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
