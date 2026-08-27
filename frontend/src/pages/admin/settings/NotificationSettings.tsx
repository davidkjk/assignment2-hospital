import type { CSSProperties } from 'react'
import { NOTIFICATION_LABELS, NOTIFICATION_ORDER, type NotificationType, type Settings } from '../../../api/settings'

// [HSET-MSG-*] 자동 알림 — 종류·문구·문자로도 세 열(HSET-MSG-02). 문구는 통째 자유편집(HSET-MSG-09·10),
// 토큰은 버튼으로 꽂는다(HSET-MSG-16, 오타 방지). 고친 줄에만 「기본 문구로」(HSET-MSG-22). 문자가 꺼져 있으면
// 「문자로도」 열만 잠기고 표 위에 띠+이동 버튼(HSET-MSG-27·30·SMS-02c) — 문구 칸은 안 잠근다(표 통째 잠금=사고).

const TOKENS = ['환자 이름', '날짜', '시각']

interface Props {
  draft: Settings
  smsEnabled: boolean
  onBodyChange: (type: NotificationType, body: string) => void
  onSmsChange: (type: NotificationType, value: boolean) => void
  onRevert: (type: NotificationType) => void
  onInsertToken: (type: NotificationType, token: string) => void
  onGoSms: () => void
}

export function NotificationSettings({ draft, smsEnabled, onBodyChange, onSmsChange, onRevert, onInsertToken, onGoSms }: Props) {
  return (
    <div style={styles.section}>
      {!smsEnabled && (
        <div style={styles.strip} role="note">
          <span>문자 발송이 꺼져 있어 「문자로도」를 고를 수 없습니다.</span>
          <button type="button" onClick={onGoSms}>문자 발송 설정으로 ›</button>
        </div>
      )}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>종류</th>
            <th style={styles.th}>문구</th>
            <th style={styles.th}>문자로도</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_ORDER.map((type) => {
            const row = draft.notifications[type]
            return (
              <tr key={type} data-testid={`msg-row-${type}`}>
                <td style={styles.td}>{NOTIFICATION_LABELS[type]}</td>
                <td style={styles.td}>
                  <div style={styles.tokens}>
                    {TOKENS.map((t) => (
                      <button key={t} type="button" onClick={() => onInsertToken(type, t)} style={styles.tokenBtn}>{t}</button>
                    ))}
                  </div>
                  <textarea
                    value={row.body}
                    onChange={(e) => onBodyChange(type, e.target.value)}
                    aria-label={`${NOTIFICATION_LABELS[type]} 문구`}
                    rows={2}
                    style={styles.textarea}
                  />
                  {!row.is_default && (
                    <button type="button" onClick={() => onRevert(type)} style={styles.revert}>기본 문구로 되돌리기</button>
                  )}
                </td>
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={row.send_sms}
                    disabled={!smsEnabled}
                    onChange={(e) => onSmsChange(type, e.target.checked)}
                    aria-label={`${NOTIFICATION_LABELS[type]} 문자로도`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={styles.hint}>당일 접수 환자는 시각이 없어 이 부분이 빠집니다.</p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  strip: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--color-surface-muted, #eef3f7)', borderRadius: 6, fontSize: 'var(--fs-sm)' },
  table: { borderCollapse: 'collapse', width: '100%' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--color-divider)', fontSize: 'var(--fs-sm)' },
  td: { padding: '8px', borderBottom: '1px solid var(--color-divider)', verticalAlign: 'top' },
  tokens: { display: 'flex', gap: 6, marginBottom: 4 },
  tokenBtn: { fontSize: 'var(--fs-sm)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', cursor: 'pointer' },
  textarea: { width: '100%', minWidth: 240, resize: 'vertical' },
  revert: { marginTop: 4, fontSize: 'var(--fs-sm)', border: '1px solid var(--color-divider)', background: 'var(--color-surface)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: 'var(--color-ink-muted)' },
  hint: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
