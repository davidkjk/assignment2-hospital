import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Search, Send, Users, X } from '@/components/icons'
import { maskBirth, maskPhone } from '../mockData'
import {
  PageHead,
  Panel,
  SearchInput,
  Segmented,
  StaffPage,
  StatusBadge,
  Tag,
  btnGhost,
  btnPrimary,
} from '../_ui'
import {
  automaticMessages,
  messagePatients,
  scheduledMessages,
  sentMessages,
  type MessageKind,
  type MessageLog,
} from './mockData'

// 안내 보내기 (/messages) — PICK-* · SEND-*.
// 최상위: data-testid="staff-messages". 예약/발송 이력, 대상 명단, 새 발송 사이드패널.

type SidePanel = { kind: 'compose' } | { kind: 'recipients'; log: MessageLog }
type ConfirmState = { title: string; body: string; confirmLabel: string; action: 'all' | 'send' | 'schedule' | 'cancel' }

const cellClass = 'px-3 py-2.5 align-top text-sm'

function MessageTable({ rows, onOpenRecipients, scheduled = false, onCancel }: {
  rows: MessageLog[]
  onOpenRecipients: (log: MessageLog) => void
  scheduled?: boolean
  onCancel?: (log: MessageLog) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left">
        <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
          <tr>
            <th className={cellClass}>종류</th>
            <th className={`${cellClass} w-[34%]`}>내용</th>
            <th className={cellClass}>보낸 직원</th>
            <th className={cellClass}>채널</th>
            <th className={cellClass}>시각</th>
            <th className={cellClass}>대상 수</th>
            <th className={cellClass}>발송 결과</th>
            {scheduled && <th className={cellClass} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/60">
              <td className={cellClass}><Tag>{row.kind}</Tag></td>
              <td className={`${cellClass} leading-5`}>{row.content}</td>
              <td className={`${cellClass} whitespace-nowrap`}>{row.staff}</td>
              <td className={`${cellClass} text-muted-foreground`}>{row.channel}</td>
              <td className={`${cellClass} whitespace-nowrap tabular-nums`}>{row.at}</td>
              <td className={cellClass}>
                <button onClick={() => onOpenRecipients(row)} className="font-medium text-primary hover:underline">
                  대상 {row.targetCount}명
                </button>
              </td>
              <td className={`${cellClass} whitespace-nowrap`}>
                {scheduled ? <StatusBadge status="예약됨" tone="sky" /> : row.result}
              </td>
              {scheduled && (
                <td className={cellClass}>
                  <button className="text-xs font-medium text-primary hover:underline" onClick={() => onCancel?.(row)}>예약 취소</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Messages() {
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null)
  const [automaticOpen, setAutomaticOpen] = useState(false)
  const [kind, setKind] = useState<MessageKind>('안내')
  const [query, setQuery] = useState('')
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([])
  const [allPatients, setAllPatients] = useState(false)
  const [channel, setChannel] = useState('앱 알림 + 못 받는 사람은 문자')
  const [content, setContent] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const normalizedQuery = query.replace(/[-.\s]/g, '')
  const results = useMemo(() => {
    if (!query.trim()) return []
    return messagePatients.filter((patient) =>
      `${patient.name}${patient.birth}${patient.phone}`.replace(/[-.\s]/g, '').includes(normalizedQuery),
    )
  }, [normalizedQuery, query])
  const selectedCount = allPatients ? 3240 : selectedPatientIds.length

  const resetCompose = () => {
    setKind('안내')
    setQuery('')
    setSelectedPatientIds([])
    setAllPatients(false)
    setChannel('앱 알림 + 못 받는 사람은 문자')
    setContent('')
    setSidePanel({ kind: 'compose' })
  }

  const togglePatient = (patientId: string) => {
    setAllPatients(false)
    setSelectedPatientIds((current) =>
      current.includes(patientId) ? current.filter((id) => id !== patientId) : [...current, patientId],
    )
  }

  return (
    <StaffPage testid="staff-messages" max="max-w-[1500px]">
      <PageHead
        title="안내 보내기"
        sub="직원이 보낸 안내와 예약한 발송을 확인합니다"
        action={<button className={btnPrimary} onClick={resetCompose}><Send className="h-4 w-4" />새로 보내기</button>}
      />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-4">
          {scheduledMessages.length > 0 && (
            <Panel title={`예약해 둔 것 ${scheduledMessages.length}건`} pad="p-0">
              <MessageTable
                rows={scheduledMessages}
                scheduled
                onOpenRecipients={(log) => setSidePanel({ kind: 'recipients', log })}
                onCancel={(log) => setConfirm({ title: '예약 발송을 취소할까요?', body: `\u300C${log.content}\u300D 발송 예약을 취소합니다.`, confirmLabel: '예약 취소', action: 'cancel' })}
              />
            </Panel>
          )}

          <Panel title="보낸 것" pad="p-0">
            <MessageTable rows={sentMessages} onOpenRecipients={(log) => setSidePanel({ kind: 'recipients', log })} />
            <button
              onClick={() => setAutomaticOpen((open) => !open)}
              className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm font-medium hover:bg-muted"
            >
              {automaticOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              자동 발송 41건 보기
            </button>
            {automaticOpen && (
              <div className="border-t border-border">
                <MessageTable rows={automaticMessages} onOpenRecipients={(log) => setSidePanel({ kind: 'recipients', log })} />
              </div>
            )}
          </Panel>
        </div>

        {sidePanel && (
          <aside className="w-[360px] shrink-0">
            <Panel
              title={sidePanel.kind === 'compose' ? '새 안내 보내기' : `대상 ${sidePanel.log.targetCount}명`}
              action={<button aria-label="패널 닫기" className="rounded-md p-1 hover:bg-muted" onClick={() => setSidePanel(null)}><X className="h-4 w-4" /></button>}
            >
              {sidePanel.kind === 'recipients' ? (
                <div>
                  <p className="mb-3 text-xs text-muted-foreground">이름·마스킹된 번호·개별 발송 결과입니다.</p>
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {sidePanel.log.recipients.map((recipient) => (
                      <div key={recipient.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div>
                          <div className="font-medium">{recipient.name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{maskPhone(recipient.phone)}</div>
                        </div>
                        <StatusBadge
                          status={recipient.result}
                          tone={recipient.result === '도달' ? 'green' : recipient.result === '실패' ? 'red' : 'sky'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="mb-1.5 font-medium">종류</div>
                    <Segmented
                      value={kind}
                      onChange={setKind}
                      options={[{ key: '안내', label: '안내' }, { key: '광고', label: '광고' }]}
                    />
                    {kind === '광고' && <p className="mt-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">광고 수신 동의자만 대상에 남고 (AD)·수신거부 안내가 자동으로 붙습니다.</p>}
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium">받는 사람</span>
                      {selectedCount > 0 && <Tag>{selectedCount.toLocaleString()}명</Tag>}
                    </div>
                    {allPatients && (
                      <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 font-medium"><Users className="h-4 w-4 text-primary" />전 환자 3,240명</span>
                        <button onClick={() => setAllPatients(false)} className="text-xs text-primary hover:underline">풀기</button>
                      </div>
                    )}
                    {!allPatients && selectedPatientIds.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {messagePatients.filter((patient) => selectedPatientIds.includes(patient.id)).map((patient) => (
                          <button key={patient.id} onClick={() => togglePatient(patient.id)} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                            {patient.name}<X className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    )}
                    {!allPatients && (
                      <>
                        <SearchInput value={query} onChange={setQuery} placeholder="이름 · 전화 · 생년월일" icon={<Search className="h-4 w-4" />} />
                        {results.length > 0 && (
                          <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
                            {results.map((patient) => {
                              const selected = selectedPatientIds.includes(patient.id)
                              return (
                                <button key={patient.id} onClick={() => togglePatient(patient.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left ${selected ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                                    {selected && <Check className="h-3 w-3" />}
                                  </span>
                                  <span>
                                    <span className="block font-medium">{patient.name}</span>
                                    <span className="text-xs text-muted-foreground">{maskBirth(patient.birth)} · {maskPhone(patient.phone)}</span>
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        <button
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          onClick={() => setConfirm({ title: '전 환자에게 보낼까요?', body: '현재 전체 환자 3,240명이 대상입니다. 문자 발송에는 비용이 듭니다.', confirmLabel: '전 환자 선택', action: 'all' })}
                        >
                          <Users className="h-4 w-4" />전 환자에게 보내기
                        </button>
                      </>
                    )}
                  </div>

                  <fieldset>
                    <legend className="mb-1.5 font-medium">보내는 방법</legend>
                    <div className="space-y-1.5">
                      {['앱 알림 + 못 받는 사람은 문자', '앱 알림만', '모두에게 문자도'].map((item) => (
                        <label key={item} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2">
                          <input type="radio" name="channel" checked={channel === item} onChange={() => setChannel(item)} />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                    {selectedCount > 0 && <p className="mt-2 text-xs text-muted-foreground">앱 알림 {Math.max(0, selectedCount - 34).toLocaleString()}건 · 문자 {Math.min(34, selectedCount)}건 — 문자에 비용이 듭니다</p>}
                  </fieldset>

                  <label className="block">
                    <span className="mb-1.5 block font-medium">내용</span>
                    <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} placeholder="환자에게 전할 안내를 작성하세요" className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring/40" />
                    <span className="mt-1 block text-right text-xs text-muted-foreground tabular-nums">{content.length} / 1,000</span>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      disabled={selectedCount === 0 || !content.trim()}
                      className={btnGhost}
                      onClick={() => setConfirm({ title: '예약 발송으로 등록할까요?', body: `8월 23일 18:00에 ${selectedCount.toLocaleString()}명에게 보냅니다.`, confirmLabel: '예약 발송', action: 'schedule' })}
                    >예약 발송</button>
                    <button
                      disabled={selectedCount === 0 || !content.trim()}
                      className={btnPrimary}
                      onClick={() => setConfirm({ title: '지금 보낼까요?', body: `${selectedCount.toLocaleString()}명에게 발송하며 보낸 후에는 되돌릴 수 없습니다.`, confirmLabel: '지금 보내기', action: 'send' })}
                    >지금 보내기</button>
                  </div>
                </div>
              )}
            </Panel>
          </aside>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="dialog" aria-modal="true">
          <Panel className="w-full max-w-md" title={confirm.title}>
            <p className="text-sm leading-6 text-muted-foreground">{confirm.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirm(null)}>돌로</button>
              <button
                className={btnPrimary}
                onClick={() => {
                  if (confirm.action === 'all') setAllPatients(true)
                  if (confirm.action === 'send' || confirm.action === 'schedule') setSidePanel(null)
                  setConfirm(null)
                }}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
