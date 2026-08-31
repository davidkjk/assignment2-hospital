import { useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { InlineError } from '../../components/InlineError'
import { sendMessage, type MessageChannel, type MessageKind, type SendInput } from '../../api/messages'
import { KindChannelFields } from './KindChannelFields'
import { RecipientField, type Recipients } from './RecipientField'
import { NightRescheduleDialog } from './NightRescheduleDialog'
import { AllPatientsPreviewDialog } from './AllPatientsPreviewDialog'

// [Task 28][SEND-BOX-02·03] 안내 보내기 — **본화면 2단**이다(2026-08-31 손검수 ⑤·헤더 예약과 통일).
//   왼쪽이 「고르는 도구」(받는 사람: 세그먼트+환자 검색, SEND-BOX-03), 오른쪽이 보내는 내용(종류·방법·내용).
//   옛 오른쪽 320px 좁은 패널(PanelHost)에서 옮겨 왔다 — 검색으로 왼쪽 본화면에서 고르게(그릇 통합).
//   되돌릴 수 없고 돈이 드는 발송(광고·전 환자)은 미리보기를 거친다(SEND-ADS-06·SEND-ALL-04).
//   야간 광고 즉시발송은 NightRescheduleDialog로 예약을 제안한다(SEND-NIGHT-02).
// ⛔ 실제 배달·결과는 Task 30 — 여기서는 enqueue(만들기)까지다.

interface Props {
  /** 환자 상세/목록에서 미리 채워 열 때(SEND-WHO-01·02). 없으면 빈 채로(SEND-WHO-03). */
  initialRecipients?: Recipients
  /** 보내고 나거나 접었을 때 목록으로 돌아간다(옛 closePanel 대체). */
  onClose?: () => void
}

export function SendPanel({ initialRecipients, onClose }: Props) {
  const qc = useQueryClient()

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
      onClose?.()
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
    <div style={styles.compose} data-component="SendPanel">
      <div style={styles.cols}>
        {/* 왼쪽 — 받는 사람을 고르는 도구(SEND-BOX-03). 검색 결과는 이 칸 안에서 스크롤한다. */}
        <section style={styles.left} aria-label="받는 사람 고르기">
          <RecipientField value={recipients} onChange={setRecipients} />
        </section>

        {/* 오른쪽 — 보내는 내용. 종류·방법·내용과 보내기 버튼. */}
        <section style={styles.right} aria-label="보내는 내용">
          <KindChannelFields
            kind={kind}
            channel={channel}
            recipientCount={recipientCount}
            onKindChange={setKind}
            onChannelChange={setChannel}
          />

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
        </section>
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
  compose: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' },
  // 왼쪽 검색은 넉넉히, 오른쪽 내용 폼은 좁게 — 헤더 예약 문(왼쪽 본화면 / 오른쪽 폼)과 같은 결.
  cols: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)', gap: 'var(--sp-5)', alignItems: 'start' },
  left: {
    minWidth: 0, padding: 'var(--sp-4)', background: 'var(--color-surface)',
    border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  right: {
    display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', padding: 'var(--sp-4)',
    background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' },
  label: { fontSize: 'var(--fs-caption)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], color: 'var(--color-ink-muted)' },
  textarea: {
    padding: 'var(--sp-3)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    resize: 'vertical',
  },
  input: {
    height: 36,
    padding: '0 var(--sp-3)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' },
  laterBtn: {
    height: 36,
    padding: '0 var(--sp-4)',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  sendBtn: {
    height: 36,
    padding: '0 var(--sp-5)',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
}
