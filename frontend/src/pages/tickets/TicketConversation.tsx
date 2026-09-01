import type { ReactNode } from 'react'
import { Sparkles, Stethoscope, UserRound } from '../../components/icons'
import type { ConvMessage, Sender, Contact } from '../../api/staffChatDetail'

// 전체 대화(CONV-01) — 같은 상담방·시간순·발신 주체 구분. ⭐ 규칙: 환자=왼쪽 / AI·직원=오른쪽(색만이 아니라 자리).
// 대화 0건은 '원본 대화가 없습니다'(EMPTY-01, 오류·로딩과 구분), 대화만 실패면 이 영역에만 오류+[다시 시도](ERR-01).
// 배지(미확인/읽음/문자)는 renderBadges로 주입(Step 6). 시각은 데모 tickets Bubble 그대로.

const SENDER_LABEL: Record<Sender, string> = { patient: '환자', ai: 'AI', staff: '직원', system: '안내' }

export function TicketConversation(props: {
  messages: ConvMessage[]
  convError: boolean
  onRetryConv: () => void
  renderBadges?: (m: ConvMessage) => ReactNode // Step 6이 주입(미확인/읽음/문자)
}) {
  const { messages, convError, onRetryConv, renderBadges } = props
  if (convError) {
    // ERR-01: 대화 영역에만 오류 — 요약은 그대로 두고 여기만 재시도.
    return (
      <div role="alert" aria-label="대화 오류" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>대화를 불러오지 못했습니다</p>
        <button type="button" onClick={onRetryConv} className="mt-2 rounded-lg border border-amber-300 bg-card px-3 py-1.5 text-sm font-medium hover:bg-amber-100">
          다시 시도
        </button>
      </div>
    )
  }
  if (messages.length === 0) {
    // EMPTY-01: 오류·로딩으로 위장하지 않는다.
    return <p aria-label="대화" className="py-8 text-center text-sm text-muted-foreground">원본 대화가 없습니다</p>
  }
  return (
    <ol aria-label="대화" className="space-y-2">
      {messages.map((m) => (
        <Bubble key={m.id} m={m} badges={renderBadges?.(m)} />
      ))}
    </ol>
  )
}

function Bubble({ m, badges }: { m: ConvMessage; badges?: ReactNode }) {
  // 환자 = 왼쪽 / 답하는 쪽(AI·직원) = 오른쪽 (CONV-01 좌우분리). 시스템은 가운데 옅은 안내.
  if (m.sender === 'system') {
    return (
      <li data-sender="system" className="flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{m.body}</span>
      </li>
    )
  }
  const right = m.sender !== 'patient'
  const tone =
    m.sender === 'patient'
      ? 'bg-muted text-foreground'
      : m.sender === 'ai'
        ? 'bg-violet-100 text-violet-900'
        : 'bg-primary text-primary-foreground'
  const metaTone = m.sender === 'staff' ? 'text-primary-foreground/80' : 'text-muted-foreground'
  const Icon = m.sender === 'ai' ? Sparkles : m.sender === 'staff' ? Stethoscope : UserRound
  return (
    <li data-sender={m.sender} className={`flex ${right ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${tone}`}>
        <div className={`mb-0.5 flex items-center gap-1 text-[11px] font-medium ${metaTone}`}>
          <Icon className="h-3 w-3" />
          <span>{SENDER_LABEL[m.sender]}</span> · <time>{m.at}</time>
        </div>
        {m.body && <p className="text-sm leading-snug">{m.body}</p>}
        {badges}
      </div>
    </li>
  )
}

// UNREAD-01·READ-01·NOTIFY-03: 메시지 배지 생성기(문구 하나·숫자 없음).
export function messageBadges(m: ConvMessage): string[] {
  const b: string[] = []
  if (m.sender === 'patient' && m.staffUnread) b.push('새 메시지 · 미확인') // UNREAD-01
  if (m.sender === 'staff' && !m.patientRead) b.push('환자 미확인') // READ-01: 실패 아님
  if (m.sender === 'staff' && m.smsSent) b.push('자리 비움 · 답변 문자로 발송됨') // NOTIFY-03
  return b
}

// CONTACT-01·NOTIFY-04: 익명 웹 연락처 마스킹. 실제 번호·직접 문자 버튼 없음.
export function ContactBanner({ contact }: { contact: Contact }) {
  if (!contact.anonymous) return null // 등록 환자는 앱 알림 — 마스킹 배너 없음
  return (
    <p aria-label="연락처" className="text-xs text-muted-foreground">
      {contact.hasPhone ? '연락처 있음 · 문자 알림 가능' : '연락처 없음 · 위젯 미읽음 점으로 안내'}
    </p>
  )
}
