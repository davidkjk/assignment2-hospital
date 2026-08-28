import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { InlineError } from '../../components/InlineError'
import { usePanel } from '../../components/PanelHost'
import { cancelScheduled, getMessages, type ScheduledRow, type SentRow } from '../../api/messages'
import { SendPanel } from './SendPanel'
import { FailedListPanel } from './FailedListPanel'

// [Task 28][SEND-DOOR-*][SEND-LIST-*] 제1문 화면 — 「예약해 둔 것 · 보낸 것」 두 구역.
// ⛔ 발송 결과·명단 열람·재시도·배지는 Task 30. 여기서는 결과 칸의 「자리」만 둔다.
const KIND_LABEL: Record<string, string> = { transactional: '안내', marketing: '광고' }
const CHANNEL_LABEL: Record<string, string> = { push: '앱 알림', sms: '문자' }
const SENT_COLUMNS = ['종류', '내용', '보낸 직원', '채널', '시각', '대상 수', '발송 결과']

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

export function MessagesPage() {
  const qc = useQueryClient()
  const { openPanel } = usePanel()
  const [pendingCancel, setPendingCancel] = useState<ScheduledRow | null>(null)
  const [showAuto, setShowAuto] = useState(false)

  const query = useQuery({ queryKey: ['messages'], queryFn: () => getMessages() })
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelScheduled(id),
    onSuccess: () => {
      setPendingCancel(null)
      qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })

  const openNew = () =>
    openPanel({ title: '새 안내 보내기', origin: '/messages', content: <SendPanel /> })

  // [SEND-RESULT-13][SEND-FAIL-01] 「안 닿은 N명 보기」 → 실패 명단 패널(같은 그릇).
  const openFailed = (row: SentRow) =>
    openPanel({
      title: '안 닿은 명단',
      origin: '/messages',
      content: <FailedListPanel batchId={row.id} />,
    })

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>안내 보내기</h1>
        <button type="button" style={styles.newBtn} onClick={openNew}>
          ＋ 새로 보내기
        </button>
      </header>

      {query.isError && <InlineError message="목록을 불러오지 못했습니다." />}

      {query.data && query.data.scheduled.length > 0 && (
        <section style={styles.section} aria-label="예약해 둔 것">
          <h2 style={styles.sectionTitle}>예약해 둔 것</h2>
          <ul style={styles.schedList}>
            {query.data.scheduled.map((row) => (
              <li key={row.id} style={styles.schedRow}>
                <span style={styles.schedWhen}>{fmtTime(row.scheduled_at)}</span>
                <span style={styles.badge}>{KIND_LABEL[row.kind] ?? row.kind}</span>
                <span style={styles.schedBody}>{row.body}</span>
                <span style={styles.schedCount}>대상 {row.target_count ?? 0}명</span>
                <button type="button" style={styles.cancelBtn} onClick={() => setPendingCancel(row)}>
                  취소
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={styles.section} aria-label="보낸 것">
        <h2 style={styles.sectionTitle}>보낸 것</h2>
        {query.data && query.data.sent.rows.length === 0 ? (
          <EmptyState kind="zero" message="아직 보낸 안내가 없습니다" />
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {SENT_COLUMNS.map((c) => (
                  <th key={c} scope="col" style={styles.th}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data?.sent.rows.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>{KIND_LABEL[row.kind] ?? row.kind}</td>
                  <td style={styles.td}>{row.body}</td>
                  <td style={styles.td}>직원</td>
                  <td style={styles.td}>{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                  <td style={styles.td}>{fmtTime(row.sent_at)}</td>
                  <td style={styles.td}>{row.target_count ?? 1}명</td>
                  {/* [SEND-RESULT-11~14] 발송 결과 — 배치별 상태 집계. */}
                  <td style={styles.td}>
                    <ResultCell row={row} channelLabel={CHANNEL_LABEL} onViewFailed={openFailed} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {query.data && query.data.auto_count > 0 && (
          <button type="button" style={styles.autoFold} onClick={() => setShowAuto((v) => !v)}>
            자동 발송 {query.data.auto_count}건 보기 ›
          </button>
        )}
        {showAuto && (
          <p style={styles.autoNote}>
            자동 발송(전날·당일 알림, 문진 안내)은 시스템이 보낸 것입니다. 상세 목록은 준비 중입니다.
          </p>
        )}
      </section>

      {pendingCancel && (
        <ConfirmDialog
          title="이 예약 발송을 취소할까요?"
          message={`${pendingCancel.body ?? ''} — 취소하면 예정된 발송이 나가지 않습니다.`}
          confirmLabel="예약 취소"
          cancelLabel="그대로 두기"
          danger
          onConfirm={() => cancelMut.mutate(pendingCancel.id)}
          onCancel={() => setPendingCancel(null)}
        />
      )}
    </div>
  )
}

// [SEND-RESULT-11~14] 발송 결과 한 칸. 진행/재시도/끝남/실패0을 규칙대로 그린다.
function ResultCell({
  row,
  channelLabel,
  onViewFailed,
}: {
  row: SentRow
  channelLabel: Record<string, string>
  onViewFailed: (row: SentRow) => void
}) {
  const sending = row.result.발송중
  const delivered = row.result.도달
  const retrying = row.result.재시도중
  const failed = row.result.실패
  const total = sending + delivered + retrying + failed
  const chan = channelLabel[row.channel] ?? row.channel

  // SEND-RESULT-11 — 발송 직후(아직 아무 결과도 안 돌아옴): 「문자 34건 발송 중」.
  if (sending === total && total > 0) {
    return (
      <span style={styles.resultMuted}>
        {chan} {total}건 발송 중
      </span>
    )
  }

  // SEND-RESULT-12 — 진행 중(발송중/재시도중 남음): 무슨 일이 일어나는지 적는다.
  if (sending > 0 || retrying > 0) {
    const parts: string[] = []
    if (delivered) parts.push(`도달 ${delivered}건`)
    if (retrying) parts.push(`재시도 중 ${retrying}건`)
    if (sending) parts.push(`발송 중 ${sending}건`)
    if (failed) parts.push(`실패 ${failed}건`)
    return <span style={styles.resultMuted}>{parts.join(' · ')}</span>
  }

  // SEND-RESULT-14 — 끝났고 실패 0건: 「도달 34건」만(⛔ 실패 0건을 적지 않는다).
  if (failed === 0) {
    return <span style={styles.resultOk}>도달 {delivered}건</span>
  }

  // SEND-RESULT-13 — 끝났고 실패 있음: 「도달 32건 · 실패 2건」 + [안 닿은 2명 보기].
  return (
    <span style={styles.resultRow}>
      도달 {delivered}건 · <span style={styles.resultFail}>실패 {failed}건</span>
      <button type="button" style={styles.viewFailed} onClick={() => onViewFailed(row)}>
        안 닿은 {failed}명 보기
      </button>
    </span>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 20, display: 'flex', flexDirection: 'column', gap: 20 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--color-ink)' },
  newBtn: {
    height: 36,
    padding: '0 16px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  section: {
    border: '1px solid var(--color-divider)',
    borderRadius: 'var(--radius-card)',
    background: 'var(--color-surface)',
    padding: 16,
  },
  sectionTitle: { margin: '0 0 12px', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  schedList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  schedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 12px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
  },
  schedWhen: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)', fontWeight: 600 },
  badge: {
    padding: '2px 8px',
    borderRadius: 6,
    background: 'var(--color-surface-muted, #eef2f6)',
    fontSize: 'var(--fs-sm)',
    color: 'var(--color-ink-muted)',
  },
  schedBody: { flex: 1, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  schedCount: { color: 'var(--color-ink-muted)', fontSize: 'var(--fs-sm)' },
  cancelBtn: {
    height: 30,
    padding: '0 12px',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid var(--color-divider)',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--color-divider)', color: 'var(--color-ink)' },
  tdMuted: { padding: '8px 10px', borderBottom: '1px solid var(--color-divider)', color: 'var(--color-ink-muted)' },
  resultMuted: { color: 'var(--color-ink-muted)', fontSize: 'var(--fs-sm)' },
  resultOk: { color: 'var(--color-ink)', fontSize: 'var(--fs-sm)' },
  resultRow: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)' },
  resultFail: { color: 'var(--color-danger, #b42318)', fontWeight: 600 },
  viewFailed: {
    background: 'none',
    border: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
  autoFold: {
    marginTop: 12,
    background: 'none',
    border: 'none',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  autoNote: { marginTop: 8, color: 'var(--color-ink-muted)', fontSize: 'var(--fs-sm)' },
}
