import { useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePanel } from '../../components/PanelHost'
import { InlineError } from '../../components/InlineError'
import { sendMessage, type MessageChannel, type MessageKind, type SendInput } from '../../api/messages'
import { KindChannelFields } from './KindChannelFields'
import { RecipientField, type Recipients } from './RecipientField'
import { NightRescheduleDialog } from './NightRescheduleDialog'
import { AllPatientsPreviewDialog } from './AllPatientsPreviewDialog'

// [Task 28][SEND-BOX-02] 발송 패널 그릇 — 위→아래 종류·받는 사람·보내는 방법·내용 + [나중에 보내기][보내기].
//   되돌릴 수 없고 돈이 드는 발송(광고·전 환자)은 미리보기를 거친다(SEND-ADS-06·SEND-ALL-04).
//   야간 광고 즉시발송은 NightRescheduleDialog로 예약을 제안한다(SEND-NIGHT-02).
// ⛔ 실제 배달·결과는 Task 30 — 여기서는 enqueue(만들기)까지다.

interface Props {
  /** 환자 상세/목록에서 미리 채워 열 때(SEND-WHO-01·02). 없으면 빈 채로(SEND-WHO-03). */
  initialRecipients?: Recipients
}

export function SendPanel({ initialRecipients }: Props) {
  const qc = useQueryClient()
  const { closePanel } = usePanel()

  const [kind, setKind] = useState<MessageKind>('transactional') // SEND-KIND-02 기본 안내
  const [channel, setChannel] = useState<MessageChannel>('push_sms') // SEND-CH-02 기본 폴백
  const [body, setBody] = useState('')
  const [recipients, setRecipients] = useState<Recipients>(initialRecipients ?? { mode: 'pick', ids: [] })
  const [scheduleAt, setScheduleAt] = useState('') // datetime-local 값(빈 문자열=즉시)
  const [showSchedule, setShowSchedule] = useState(false)

  const [preview, setPreview] = useState(false)
  const [night, setNight] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recipientCount = recipients.mode === 'pick' ? recipients.ids.length : 0
  const isAll = recipients.mode === 'all'
  const hasRecipients = isAll || recipientCount > 0

  const recipientsSpec = (): SendInput['recipients_spec'] =>
    recipients.mode === 'all' ? { all: true } : { patient_ids: recipients.ids }

  const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null)

  const mutation = useMutation({
    mutationFn: (input: SendInput) => sendMessage(input),
    onSuccess: (res) => {
      if (res.night_blocked && res.suggested_at) {
        setNight(res.suggested_at) // 즉시발송 대신 예약 제안 — 문구는 그대로 남는다
        return
      }
      qc.invalidateQueries({ queryKey: ['messages'] })
      closePanel()
    },
    onError: (e) => setError(e instanceof Error ? e.message : '보내지 못했습니다.'),
  })

  const doSend = (scheduledIso: string | null) => {
    setError(null)
    mutation.mutate({ kind, recipients_spec: recipientsSpec(), channel, body, scheduled_at: scheduledIso })
  }

  const onSendClick = () => {
    if (!hasRecipients) return setError('받는 사람을 한 명 이상 골라 주세요.')
    if (!body.trim()) return setError('보낼 내용을 적어 주세요.')
    // 되돌릴 수 없고 돈이 드는 발송은 미리보기를 먼저 띄운다.
    if (kind === 'marketing' || isAll) return setPreview(true)
    doSend(toIso(scheduleAt))
  }

  const confirmPreview = () => {
    setPreview(false)
    doSend(toIso(scheduleAt))
  }

  return (
    <div style={styles.panel} data-component="SendPanel">
      <h2 style={styles.heading}>새 안내 보내기</h2>

      <KindChannelFields
        kind={kind}
        channel={channel}
        recipientCount={recipientCount}
        onKindChange={setKind}
        onChannelChange={setChannel}
      />

      <RecipientField value={recipients} onChange={setRecipients} />

      <label style={styles.field}>
        <span style={styles.label}>내용</span>
        <textarea
          aria-label="내용"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          style={styles.textarea}
        />
      </label>

      {showSchedule && (
        <label style={styles.field}>
          <span style={styles.label}>보낼 시각</span>
          <input
            type="datetime-local"
            aria-label="보낼 시각"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            style={styles.input}
          />
        </label>
      )}

      {error && <InlineError message={error} />}

      <div style={styles.actions}>
        <button type="button" style={styles.laterBtn} onClick={() => setShowSchedule((v) => !v)}>
          나중에 보내기
        </button>
        <button type="button" style={styles.sendBtn} onClick={onSendClick} disabled={mutation.isPending}>
          {scheduleAt ? '예약하기' : '보내기'}
        </button>
      </div>

      {preview && (
        <AllPatientsPreviewDialog
          kind={kind}
          body={body}
          targetCount={recipientCount}
          isAll={isAll}
          onConfirm={confirmPreview}
          onCancel={() => setPreview(false)}
        />
      )}

      {night && (
        <NightRescheduleDialog
          suggestedAt={night}
          onReschedule={(iso) => {
            setNight(null)
            doSend(iso)
          }}
          onCancel={() => setNight(null)}
        />
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: 14, padding: 4 },
  heading: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--color-ink-muted)' },
  textarea: {
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    resize: 'vertical',
  },
  input: {
    height: 36,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  laterBtn: {
    height: 36,
    padding: '0 14px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  sendBtn: {
    height: 36,
    padding: '0 18px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
