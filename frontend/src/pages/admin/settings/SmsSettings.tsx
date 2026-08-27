import type { CSSProperties } from 'react'
import type { Settings } from '../../../api/settings'

// [HSET-SMS-*] 문자 발송 — 사용 스위치·누구에게·비용 안내. 끄면 「누구에게」와 자동 알림의
// 「문자로도」 열이 잠긴다(HSET-SMS-02·02b). 문자는 초기 ON(결정31), 제공자 미연결은 함께 노출(무음 실패 방지).

interface Props {
  draft: Settings
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export function SmsSettings({ draft, onChange }: Props) {
  return (
    <div style={styles.section}>
      <label style={styles.toggleRow}>
        <input
          type="checkbox"
          checked={draft.sms_enabled}
          onChange={(e) => onChange('sms_enabled', e.target.checked)}
          aria-label="문자 발송 사용"
        />
        <span>문자 발송 사용</span>
      </label>

      <label style={styles.field}>
        <span>누구에게 문자를 보낼까요</span>
        <select
          disabled={!draft.sms_enabled}
          value={draft.sms_recipients}
          onChange={(e) => onChange('sms_recipients', e.target.value as Settings['sms_recipients'])}
          aria-label="누구에게"
        >
          <option value="app_only">앱을 안 쓰는 환자에게만(폴백)</option>
          <option value="all">모든 환자에게</option>
        </select>
      </label>

      <label style={styles.field}>
        <span>수신거부 번호</span>
        <input
          type="text"
          disabled={!draft.sms_enabled}
          value={draft.sms_opt_out_number ?? ''}
          onChange={(e) => onChange('sms_opt_out_number', e.target.value)}
          aria-label="수신거부 번호"
        />
      </label>

      <p style={styles.hint}>문자는 건당 비용이 듭니다. 앱 알림으로 닿지 않는 환자에게만 보내면 비용을 아낄 수 있습니다.</p>
      {!draft.sms_provider_connected && (
        <p style={styles.warn}>문자 제공자가 아직 연결되지 않았습니다. 연결 전에는 문자가 실제로 나가지 않습니다.</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 300 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  warn: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-warn)', fontWeight: 600 },
}
