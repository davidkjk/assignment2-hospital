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
      {/* 플랫 행(사용자 결정 2026-09-09) — 개별 카드 테두리 없이 목록 카드 안에 구분선으로 나열. 선택 시
          왼쪽 3px 강조 바 + 옅은 배경(색만으로 구분 안 함 — 내 담당은 아래 「내 담당」 칩이 함께 말한다). */}
      <button
        type="button"
        onClick={() => onSelect(ticket)}
        className={`relative block w-full px-3 py-2.5 text-left transition-colors ${
          active ? 'bg-primary/5' : 'hover:bg-muted'
        }`}
      >
        {active && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
        {/* break-words: 공백 없는 긴 토큰(번호·영문)도 열 안에서 줄바꿈해 삐져나오지 않게 */}
        <span className="line-clamp-2 break-words text-sm font-medium">{ticket.patientQuestion}</span>
        <p className="mt-1 line-clamp-1 break-all text-xs text-muted-foreground">인계 이유: {ticket.handoffReason}</p>
        {bookingLabel && (
          // min-w-0: 예약 요약(appointmentSummary)이 길어도 이 flex 줄이 열(w-96)을 뚫지 않게 —
          //   배지는 shrink-0로 온전히, 요약은 truncate로 …처리(가로 오버플로 방지, TICKET-ROW 데모정렬).
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              {bookingLabel}
            </span>
            {ticket.appointmentSummary && (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">· {ticket.appointmentSummary}</span>
            )}
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <time className="shrink-0">{fmtCreated(ticket.createdAt)}</time>
          <span className="flex min-w-0 items-center gap-1.5">
            {/* 이관 알림: 내게 배정된 상담을 공용 문의함에서 바로 알아보게 강조 */}
            {ticket.isMine && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">내 담당</span>}
            <span className="truncate">담당: {ticket.assigneeName ?? '미배정'}</span>
          </span>
        </div>
      </button>
    </li>
  )
}
