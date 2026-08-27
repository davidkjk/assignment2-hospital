import type { CSSProperties } from 'react'
import type { MessageChannel, MessageKind } from '../../api/messages'

// [Task 28][SEND-KIND-01][SEND-CH-01·04] 종류(맨 위)·보내는 방법·문자 건수.
// ⛔ 광고 동의 필터·문자 실건수 원천은 환자앱(3단계) — 여기서는 상한 계산(대상 수)만 보인다.
const CHANNEL_OPTIONS: { value: MessageChannel; label: string }[] = [
  { value: 'push_sms', label: '앱 알림 + 못 받는 사람은 문자' },
  { value: 'push', label: '앱 알림만' },
  { value: 'sms', label: '모두에게 문자도' },
]

interface Props {
  kind: MessageKind
  channel: MessageChannel
  recipientCount: number
  onKindChange: (k: MessageKind) => void
  onChannelChange: (c: MessageChannel) => void
}

/** [SEND-CH-04] 문자 건수 상한 — 앱만이면 0, 그 외엔 대상 수만큼(폴백/모두문자). */
export function smsCountFor(channel: MessageChannel, recipientCount: number): number {
  return channel === 'push' ? 0 : recipientCount
}

export function KindChannelFields({ kind, channel, recipientCount, onKindChange, onChannelChange }: Props) {
  const smsCount = smsCountFor(channel, recipientCount)
  return (
    <div style={styles.wrap}>
      <label style={styles.field}>
        <span style={styles.label}>종류</span>
        <select
          aria-label="종류"
          value={kind}
          onChange={(e) => onKindChange(e.target.value as MessageKind)}
          style={styles.select}
        >
          <option value="transactional">안내</option>
          <option value="marketing">광고</option>
        </select>
      </label>

      <label style={styles.field}>
        <span style={styles.label}>보내는 방법</span>
        <select
          aria-label="보내는 방법"
          value={channel}
          onChange={(e) => onChannelChange(e.target.value as MessageChannel)}
          style={styles.select}
        >
          {CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {smsCount > 0 && (
          <span style={styles.cost}>문자 {smsCount}건에 비용이 듭니다</span>
        )}
      </label>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)' },
  select: {
    height: 36,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  cost: { fontSize: 'var(--fs-sm)', color: 'var(--color-danger)', fontWeight: 600 },
}
