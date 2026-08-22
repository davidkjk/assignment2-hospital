import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarDays, CheckCircle2, MessageCircle, Send, UserRound } from '@/components/icons'
import { EmptyState, PageHead, Panel, Segmented, StaffPage, StatusBadge, Tag, btnGhost, btnPrimary } from '../_ui'
import { useStaff } from '../staffState'
import { ACTIVE_STAFF, INITIAL_TICKETS, ticketsForStatus, type Ticket, type TicketStatus } from './mockData'

// 문의 티켓함 (/staff/tickets) — TICKET-INBOX-* + TICKET-DETAIL-*.
// data-testid="staff-tickets". 새 문의 선택은 현재 직원 자동 배정과 처리 중 전환을 함께 수행한다.

const TABS: { key: TicketStatus; label: string }[] = [
  { key: 'pending', label: '새 문의' },
  { key: 'in_progress', label: '처리 중' },
  { key: 'answered', label: '답변 완료' },
]

const LIVE_STATUS: Record<TicketStatus, string> = {
  pending: '직원 연결 중',
  in_progress: '직원 상담 중',
  answered: '상담 종료',
}

function TicketRow({ ticket, selected, onSelect }: { ticket: Ticket; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`w-full px-3 py-3 text-left transition-colors hover:bg-muted/60 ${selected ? 'bg-primary/10' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-semibold leading-5">{ticket.question}</div>
        {ticket.unread && <Tag className="!bg-primary/10 !text-primary">새 메시지 · 미확인</Tag>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{ticket.handoffReason}</div>
      {ticket.bookingType && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tag className="!bg-primary/10 !text-primary">{ticket.bookingType}</Tag>
          <span className="text-xs text-muted-foreground">{ticket.bookingSummary}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{ticket.createdLabel}</span>
        <span>담당 · {ticket.assignee ?? '미배정'}</span>
      </div>
    </button>
  )
}

function TicketDetail({
  ticket,
  draft,
  onDraftChange,
  onSend,
  onTransfer,
  onAskClose,
}: {
  ticket: Ticket
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onTransfer: (name: string) => void
  onAskClose: () => void
}) {
  const navigate = useNavigate()
  const [nextAssignee, setNextAssignee] = useState(ticket.assignee ?? ACTIVE_STAFF[0].name)
  const readonly = ticket.status === 'answered'
  const summary = [
    ['환자가 궁금해한 내용', ticket.summary.question],
    ['상담봇이 확인한 정보', ticket.summary.confirmed],
    ['이미 안내한 내용', ticket.summary.guided],
    ['해결되지 않은 이유', ticket.summary.unresolved],
    ['직원이 확인할 사항', ticket.summary.staffCheck],
  ]

  const transferTargets = ticket.reason === 'medical_judgment'
    ? ACTIVE_STAFF.filter((member) => member.role === '의사' || member.role === '관리자')
    : ACTIVE_STAFF

  return (
    <div className="space-y-3">
      <Panel
        title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" />담당 이관</span>}
        action={<StatusBadge status={LIVE_STATUS[ticket.status]} tone={ticket.status === 'answered' ? 'gray' : 'sky'} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">현재 담당 · <strong>{ticket.assignee ?? '미배정'}</strong></span>
          {ticket.assignee && <Tag>{ACTIVE_STAFF.find((member) => member.name === ticket.assignee)?.role ?? '직원'}</Tag>}
          {!readonly && (
            <div className="ml-auto flex items-center gap-2">
              <select value={nextAssignee} onChange={(event) => setNextAssignee(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none">
                {transferTargets.map((member) => <option key={member.id} value={member.name}>{member.name} · {member.role}</option>)}
              </select>
              <button onClick={() => onTransfer(nextAssignee)} className={btnGhost}>{ticket.reason === 'medical_judgment' ? '담당 의사에게 전달' : '이관'}</button>
            </div>
          )}
        </div>
        {ticket.reason === 'medical_judgment' && !readonly && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary"><AlertTriangle className="h-4 w-4" />의료 판단 문의는 의사 또는 관리자에게 전달해 주세요.</div>
        )}
      </Panel>

      <Panel title="인계 요약">
        <dl className="grid grid-cols-1 gap-x-5 gap-y-3 text-sm xl:grid-cols-2">
          {summary.map(([label, value], index) => (
            <div key={label} className={index === 4 ? 'xl:col-span-2' : ''}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5">{value || '없음'}</dd>
            </div>
          ))}
        </dl>
        {ticket.contactNote && <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{ticket.contactNote}</div>}
        {ticket.bookingType && (
          <button onClick={() => navigate('/staff/calendar')} className={`${btnGhost} mt-3`}><CalendarDays className="h-4 w-4 text-primary" />캘린더에서 예약 처리</button>
        )}
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" />전체 대화</span>}>
        {ticket.messages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">원본 대화가 없습니다</div>
        ) : (
          <ol className="space-y-3">
            {ticket.messages.map((message) => (
              <li key={message.id} className={`flex ${message.sender === '환자' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[78%] rounded-xl px-3 py-2 text-sm ${message.sender === '환자' ? 'bg-muted' : message.sender === 'AI' ? 'border border-border bg-card' : 'bg-primary text-primary-foreground'}`}>
                  <div className={`mb-1 text-xs font-semibold ${message.sender === '직원' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{message.sender}</div>
                  <div>{message.text}</div>
                  <div className={`mt-1 text-right text-[11px] ${message.sender === '직원' ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{message.time}</div>
                  {message.unreadByPatient && <div className="mt-1 text-[11px]">환자 미확인</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {!readonly && (
        <>
          <Panel title="답변 작성">
            <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} rows={3} placeholder="환자에게 보낼 답변을 작성하세요" className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
            <div className="mt-2 flex justify-end"><button disabled={!draft.trim()} onClick={onSend} className={btnPrimary}><Send className="h-4 w-4" />보내기</button></div>
          </Panel>
          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div><div className="text-sm font-semibold">상담 마무리</div><div className="mt-0.5 text-xs text-muted-foreground">종료한 상담은 다시 열 수 없습니다.</div></div>
              <button onClick={onAskClose} className={btnGhost}>종료 확인 열기</button>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

export function Tickets() {
  const { staff } = useStaff()
  const [tickets, setTickets] = useState(INITIAL_TICKETS)
  const [tab, setTab] = useState<TicketStatus>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmingClose, setConfirmingClose] = useState(false)
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null
  const visible = useMemo(() => ticketsForStatus(tickets, tab), [tickets, tab])

  function selectTicket(ticket: Ticket) {
    setDraft('')
    setConfirmingClose(false)
    if (ticket.status === 'pending') {
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, status: 'in_progress', assignee: staff.name, unread: false } : item))
      setTab('in_progress')
    } else {
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, unread: false } : item))
    }
    setSelectedId(ticket.id)
  }

  function updateSelected(change: (ticket: Ticket) => Ticket) {
    if (!selectedId) return
    setTickets((current) => current.map((ticket) => ticket.id === selectedId ? change(ticket) : ticket))
  }

  function sendReply() {
    const text = draft.trim()
    if (!text) return
    updateSelected((ticket) => ({ ...ticket, messages: [...ticket.messages, { id: `local-${ticket.messages.length}`, sender: '직원', text, time: '방금', unreadByPatient: true }] }))
    setDraft('')
  }

  function closeTicket(sendFirst: boolean) {
    const text = draft.trim()
    updateSelected((ticket) => ({
      ...ticket,
      status: 'answered',
      messages: [
        ...ticket.messages,
        ...(sendFirst && text ? [{ id: `local-${ticket.messages.length}`, sender: '직원' as const, text, time: '방금', unreadByPatient: true }] : []),
        { id: `closed-${ticket.messages.length}`, sender: '직원', text: '상담이 종료되었습니다.', time: '방금' },
      ],
    }))
    setDraft('')
    setConfirmingClose(false)
    setTab('answered')
  }

  return (
    <StaffPage testid="staff-tickets" max="max-w-[1500px]">
      <PageHead title="문의 티켓함" sub="직원 확인이 필요한 상담을 접수순으로 처리합니다" />
      <Segmented options={TABS} value={tab} onChange={(value) => { setTab(value); setSelectedId(null); setDraft('') }} count={(status) => tickets.filter((ticket) => ticket.status === status).length} />

      <div className="mt-3 grid min-h-[680px] grid-cols-[minmax(280px,0.72fr)_minmax(520px,1.6fr)] gap-3">
        <Panel className="overflow-hidden" pad="p-0" title={undefined}>
          <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">접수순 · 오래된 문의 먼저</div>
          {visible.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="그 상태의 문의가 없습니다" hint="다른 상태 탭을 확인해 보세요" />
          ) : (
            <div className="divide-y divide-border/60">{visible.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} selected={ticket.id === selectedId} onSelect={() => selectTicket(ticket)} />)}</div>
          )}
        </Panel>

        <div>
          {selected ? (
            <TicketDetail
              ticket={selected}
              draft={draft}
              onDraftChange={setDraft}
              onSend={sendReply}
              onTransfer={(name) => updateSelected((ticket) => ({ ...ticket, assignee: name }))}
              onAskClose={() => setConfirmingClose(true)}
            />
          ) : (
            <Panel className="h-full"><EmptyState icon={<MessageCircle className="h-6 w-6" />} title="문의 내용을 선택해 주세요" hint="새 문의를 열면 자동으로 내게 배정됩니다" /></Panel>
          )}
        </div>
      </div>

      {confirmingClose && selected && (
        <div role="dialog" aria-modal="true" aria-labelledby="close-title" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <Panel className="w-full max-w-md" title={<span id="close-title">상담을 종료할까요?</span>}>
            <p className="text-sm text-muted-foreground">종료한 상담은 다시 열거나 답변할 수 없습니다.</p>
            {draft.trim() && <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm"><strong>작성 중인 답변이 있습니다.</strong><div className="mt-0.5 text-muted-foreground">먼저 보낼까요?</div></div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmingClose(false)} className={btnGhost}>계속 상담</button>
              {draft.trim() && <button onClick={() => closeTicket(true)} className={btnGhost}>답변 보내고 종료</button>}
              <button onClick={() => closeTicket(false)} className={btnPrimary}>상담 종료</button>
            </div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
