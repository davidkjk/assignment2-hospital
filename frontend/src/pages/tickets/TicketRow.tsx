import type { InboxTicket, RequestType } from '../../api/staffChat'

// 문의함 왼쪽 목록의 한 행 — 데모 routes/staff/tickets 시각을 따른다(환자 질문·인계 이유·예약 상담
// 배지·접수시각·담당자). 되돌릴 수 없는 배정(claim)은 여기서 일으키지 않는다 — onSelect가 위(Tickets)에 맡긴다.

const REQUEST_LABEL: Partial<Record<NonNullable<RequestType>, string>> = {
  cancel: '취소 상담',
  reschedule: '변경 상담',
}

// 접수시각 라벨 — TZ 없는 문자열 파싱으로 만든다(naive Date 리터럴 금지, lint:clock). "M/D HH:mm".
function fmtCreated(iso: string): string {
  const [date, time = ''] = iso.split('T')
  const [, m, d] = date.split('-')
  const hm = time.slice(0, 5)
  return `${Number(m)}/${Number(d)}${hm ? ` ${hm}` : ''}`
}

export function TicketRow({
  ticket,
  active,
  onSelect,
}: {
  ticket: InboxTicket
  active: boolean
  onSelect: (t: InboxTicket) => void
}) {
  const bookingLabel = ticket.requestType ? REQUEST_LABEL[ticket.requestType] : undefined
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(ticket)}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
          active ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:bg-muted'
        }`}
      >
        <span className="line-clamp-2 text-sm font-medium">{ticket.patientQuestion}</span>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">인계 이유: {ticket.handoffReason}</p>
        {bookingLabel && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {bookingLabel}
            </span>
            {ticket.appointmentSummary && (
              <span className="text-[11px] text-muted-foreground">· {ticket.appointmentSummary}</span>
            )}
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <time>{fmtCreated(ticket.createdAt)}</time>
          <span>담당: {ticket.assigneeName ?? '미배정'}</span>
        </div>
      </button>
    </li>
  )
}
