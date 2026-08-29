import type { CSSProperties } from 'react'
import type { Settings } from '../../../api/settings'
import { Select, TextField } from '../../../components/staff-ui'
import { Toggle } from './Toggle'
import { SettingRow } from './SettingRow'

// [HSET-SMS-*] 문자 발송 — 사용 스위치·누구에게·비용 안내. 끄면 「누구에게」와 자동 알림의
// 「문자도 발송」 열이 잠긴다(HSET-SMS-02·02b). 문자는 초기 ON(결정31), 제공자 미연결은 함께 노출(무음 실패 방지).
// 수신거부 번호는 광고 발송이 법적으로 요구하는 병원 설정값이다(SEND-ADS-05, 정보통신망법 50조) — 비면 광고를 못 보낸다.

interface Props {
  draft: Settings
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export function SmsSettings({ draft, onChange }: Props) {
  return (
    <div style={styles.section}>
      <SettingRow
        label="문자 발송"
        hint="문자를 끄면 아래 「누구에게」와 자동 알림의 「문자도 발송」이 잠깁니다. 값은 보존됩니다."
      >
        <Toggle
          checked={draft.sms_enabled}
          onChange={(v) => onChange('sms_enabled', v)}
          aria-label="문자 발송 사용"
        />
      </SettingRow>

      <SettingRow label="누구에게 문자를 보내나">
        <Select
          disabled={!draft.sms_enabled}
          value={draft.sms_recipients}
          onChange={(v) => onChange('sms_recipients', v as Settings['sms_recipients'])}
          ariaLabel="누구에게"
        >
          <option value="app_only">앱을 안 쓰는 환자에게만</option>
          <option value="all">모든 환자에게</option>
        </Select>
      </SettingRow>

      <SettingRow label="수신거부 번호" hint="광고성 문자에 넣을 무료 수신거부 번호입니다. 비어 있으면 광고를 보낼 수 없습니다.">
        <TextField
          disabled={!draft.sms_enabled}
          value={draft.sms_opt_out_number ?? ''}
          onChange={(v) => onChange('sms_opt_out_number', v)}
          ariaLabel="수신거부 번호"
          className="min-w-56"
        />
      </SettingRow>

      <p style={styles.note}>보낼 때마다 병원이 비용을 냅니다. 앱 알림으로 닿지 않는 환자에게만 보내면 비용을 아낄 수 있습니다. 발송업체 계정은 병원에서 따로 준비합니다.</p>
      {!draft.sms_provider_connected && (
        <p style={styles.warn}>문자 제공자가 아직 연결되지 않았습니다. 연결 전에는 문자가 실제로 나가지 않습니다.</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 24 },
  note: { margin: 0, padding: '10px 14px', background: 'var(--color-done-bg)', borderRadius: 8, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  warn: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-warn)', fontWeight: 600 },
}
