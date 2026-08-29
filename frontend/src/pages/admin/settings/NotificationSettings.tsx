import type { CSSProperties } from 'react'
import { NOTIFICATION_LABELS, NOTIFICATION_ORDER, type NotificationType, type Settings } from '../../../api/settings'
import { Checkbox, TextArea } from '../../../components/staff-ui'

// [HSET-MSG-*] 자동 알림 — 종류·문구·문자도 발송 세 열(HSET-MSG-02, 「문자로도」 라벨 개정 2026-08-24).
// 토큰은 버튼으로 꽂는다(HSET-MSG-16, 오타 방지). 고친 줄에만 「기본 문구로」(HSET-MSG-22). 문자가 꺼져 있으면
// 「문자도 발송」 열만 잠기고 표 위에 띠+이동 버튼(HSET-MSG-27·30·SMS-02c) — 문구 칸은 안 잠근다(표 통째 잠금=사고).

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
      <p style={styles.intro}>
        환자에게 자동으로 나가는 알림 문구입니다. 칸을 누르고 <b>이름·날짜·시각</b> 버튼으로 값을 꽂으세요.
      </p>
      {!smsEnabled && (
        <div style={styles.strip} role="note">
          <span>문자 발송이 꺼져 있어 「문자도 발송」을 고를 수 없습니다.</span>
          <button type="button" onClick={onGoSms}>문자 발송 설정으로 ›</button>
        </div>
      )}
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>종류</th>
            <th style={styles.th}>문구</th>
            <th style={styles.th}>문자도 발송</th>
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
                  <TextArea
                    value={row.body}
                    onChange={(v) => onBodyChange(type, v)}
                    ariaLabel={`${NOTIFICATION_LABELS[type]} 문구`}
                    rows={2}
                    className="min-w-60"
                  />
                  {!row.is_default && (
                    <button type="button" onClick={() => onRevert(type)} style={styles.revert}>기본 문구로 되돌리기</button>
                  )}
                </td>
                <td style={styles.td}>
                  <Checkbox
                    checked={row.send_sms}
                    disabled={!smsEnabled}
                    onChange={(v) => onSmsChange(type, v)}
                    ariaLabel={`${NOTIFICATION_LABELS[type]} 문자도 발송`}
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
  section: { display: 'flex', flexDirection: 'column', gap: 14 },
  intro: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)', lineHeight: 1.5 },
  strip: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-done-bg)', borderRadius: 8, fontSize: 'var(--fs-caption)' },
  table: { borderCollapse: 'collapse', width: '100%' },
  th: { textAlign: 'left', padding: '8px', borderBottom: '2px solid var(--color-divider)', fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  td: { padding: '10px 8px', borderBottom: '1px solid var(--color-divider)', verticalAlign: 'top', fontSize: 'var(--fs-body)' },
  tokens: { display: 'flex', gap: 6, marginBottom: 6 },
  tokenBtn: { fontSize: 'var(--fs-caption)', padding: '3px 10px', borderRadius: 999, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', cursor: 'pointer', color: 'var(--color-ink)' },
  revert: { marginTop: 6, fontSize: 'var(--fs-caption)', border: '1px solid var(--color-divider)', background: 'var(--color-surface)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: 'var(--color-ink-muted)' },
  hint: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
