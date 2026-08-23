import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Hospital,
  LockKeyhole,
  Phone,
  Send,
  Stethoscope,
} from '@/components/icons'
import type { BotBubble, BotCard, BotNode, BotScript, QuickReply, SourceTag } from './types'

type FeedItem =
  | { id: number; role: 'bot'; bubble: BotBubble }
  | { id: number; role: 'me'; text: string }
  | { id: number; role: 'card'; card: BotCard }

// 유니온에 그냥 Omit을 쓰면 공통 키(role)만 남아 bubble/card/text가 사라진다 → 멤버마다 분배해서 Omit한다.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type FeedItemInput = DistributiveOmit<FeedItem, 'id'>

type Props = {
  script: BotScript
  /** 시작 노드 덮어쓰기(기본은 script.startId). */
  startId?: string
  /** 시작 노드 앞에 먼저 재생할 봇 말풍선(예: 취소 상담 연결 인사). */
  intro?: BotBubble[]
  /** intro가 있을 때 시작 노드의 인사 말풍선을 건너뛸지. */
  showStartBubbles?: boolean
  /** 진료과 결과 카드에서 `○○과로 계속하기`를 누름(예약 시트). */
  onDeptChosen?: (deptId: string) => void
  /** 완료 카드의 이동 버튼(사전문진 등). */
  onNavigate?: (to: string) => void
  /** 웹 위젯(익명): 예약 등 로그인 필요 행동 — 위젯 위에 인증 모달을 띄운다. */
  onAuthRequired?: (payload: { deptName: string; resumeTo: string }) => void
}

/** 외부(웹 위젯의 인증 모달)에서 로그인 성공 후 대화를 이어가게 하는 핸들. */
export type ChatEngineHandle = { goTo: (nodeId: string) => void }

const SOURCE_ICON: Record<SourceTag, typeof Stethoscope> = {
  '진료 안내': Stethoscope,
  '병원 이용 안내': Hospital,
}

export const ChatEngine = forwardRef<ChatEngineHandle, Props>(function ChatEngine(
  { script, startId, intro, showStartBubbles = true, onDeptChosen, onNavigate, onAuthRequired },
  ref,
) {
  // intro(예: 취소 상담 연결 인사)는 "응답"이 아니라 맥락이라 타이핑 없이 바로 보인다.
  const [feed, setFeed] = useState<FeedItem[]>(() =>
    (intro ?? []).map((bubble, i) => ({ id: -(i + 1), role: 'bot', bubble }) as FeedItem),
  )
  const [typing, setTyping] = useState(false)
  const [options, setOptions] = useState<QuickReply[] | null>(null)
  const [ended, setEnded] = useState(false)

  const aliveRef = useRef(true)
  const startedRef = useRef(false)
  const idRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const push = useCallback((item: FeedItemInput) => {
    setFeed((f) => [...f, { ...item, id: ++idRef.current } as FeedItem])
  }, [])

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  const typingMs = (text: string) => Math.min(1400, 520 + text.length * 15)

  const emitBubbles = useCallback(
    async (bubbles: BotBubble[]) => {
      for (const b of bubbles) {
        setTyping(true)
        await sleep(typingMs(b.text))
        if (!aliveRef.current) return
        setTyping(false)
        push({ role: 'bot', bubble: b })
        await sleep(200)
        if (!aliveRef.current) return
      }
    },
    [push],
  )

  const play = useCallback(
    async (nodeId: string, skipBubbles = false) => {
      setOptions(null)
      setEnded(false)
      const node: BotNode | undefined = script.nodes[nodeId]
      if (!node) return
      if (!skipBubbles) await emitBubbles(node.bot ?? [])
      if (!aliveRef.current) return
      if (node.card) {
        setTyping(true)
        await sleep(560)
        if (!aliveRef.current) return
        setTyping(false)
        push({ role: 'card', card: node.card })
        await sleep(120)
        if (!aliveRef.current) return
      }
      if (node.options?.length) setOptions(node.options)
      else if (node.end) setEnded(true)
    },
    [script, emitBubbles, push],
  )

  // 인증 모달(웹 위젯)이 로그인 성공 후 대화를 이어가도록 노출.
  useImperativeHandle(ref, () => ({ goTo: (nodeId: string) => void play(nodeId) }), [play])

  // 최초 1회 재생 시작.
  useEffect(() => {
    aliveRef.current = true
    if (!startedRef.current) {
      startedRef.current = true
      // intro는 위에서 초기 피드로 이미 보였으므로, 시작 노드만 재생한다.
      void play(startId ?? script.startId, Boolean(intro?.length) && !showStartBubbles)
    }
    return () => {
      aliveRef.current = false
    }
    // 최초 1회만 — script 등은 마운트 시 고정.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 새 메시지가 오면 항상 맨 아래가 보이게.
  useEffect(() => {
    const el = scrollRef.current
    // scrollTo는 jsdom에 없어 옵셔널 체이닝으로 방어(테스트 환경).
    el?.scrollTo?.({ top: el.scrollHeight, behavior: 'smooth' })
  }, [feed, typing, options])

  const onChip = (r: QuickReply) => {
    push({ role: 'me', text: r.label })
    setOptions(null)
    void play(r.to)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
        {feed.map((item, i) => {
          const interactive = i === feed.length - 1 && !typing
          if (item.role === 'me') return <MeBubble key={item.id} text={item.text} />
          if (item.role === 'bot') return <BotBubbleView key={item.id} bubble={item.bubble} />
          return (
            <CardView
              key={item.id}
              card={item.card}
              interactive={interactive}
              onConfirm={(to) => void play(to)}
              onDeptChosen={onDeptChosen}
              onNavigate={onNavigate}
              onAuthRequired={onAuthRequired}
            />
          )
        })}
        {typing && <TypingBubble />}
      </div>

      {options && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t bg-background px-3 py-2.5">
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => onChip(o)}
              className="rounded-full border border-primary/40 bg-primary/5 px-3.5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* 대본형이라 자유 입력 대신 위 버튼으로 이어간다 — 입력칸은 안내용. */}
      <div className="shrink-0 border-t bg-card px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-2.5">
          <span className="flex-1 truncate text-sm text-muted-foreground">
            {ended ? '상담이 마무리됐어요' : '데모 · 위의 버튼을 눌러 이어가세요'}
          </span>
          <Send className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
})

// ── 말풍선 ──

function BotBubbleView({ bubble }: { bubble: BotBubble }) {
  const SourceIcon = bubble.source ? SOURCE_ICON[bubble.source] : null
  return (
    <div className="animate-chat-in max-w-[85%]">
      {bubble.source && SourceIcon ? (
        <span className="mb-1 ml-1 flex items-center gap-1 text-[11px] font-bold text-primary/80">
          <SourceIcon className="h-3 w-3" aria-hidden="true" />
          {bubble.source}
        </span>
      ) : null}
      <div className="rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
        {bubble.text}
      </div>
    </div>
  )
}

function MeBubble({ text }: { text: string }) {
  return (
    <div className="animate-chat-in ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
      {text}
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="animate-chat-in flex max-w-[85%] items-center gap-1.5 rounded-2xl rounded-tl-sm border bg-card px-4 py-3 shadow-sm">
      <span className="chat-dot h-2 w-2 rounded-full bg-primary/60" />
      <span className="chat-dot h-2 w-2 rounded-full bg-primary/60" />
      <span className="chat-dot h-2 w-2 rounded-full bg-primary/60" />
    </div>
  )
}

// ── 카드 5종 ──

function CardView({
  card,
  interactive,
  onConfirm,
  onDeptChosen,
  onNavigate,
  onAuthRequired,
}: {
  card: BotCard
  interactive: boolean
  onConfirm: (to: string) => void
  onDeptChosen?: (deptId: string) => void
  onNavigate?: (to: string) => void
  onAuthRequired?: (payload: { deptName: string; resumeTo: string }) => void
}) {
  if (card.kind === 'booking') {
    return (
      <div className="animate-chat-in max-w-[92%] rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-(--elevation-card)">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-primary">
          <CalendarCheck2 className="h-4 w-4" aria-hidden="true" /> 이 내용으로 예약할까요?
        </p>
        <dl className="space-y-1.5 text-sm">
          <CardRow label="예약자" value={card.who} />
          <CardRow label="진료과" value={card.deptName} />
          <CardRow label="담당 의사" value={`${card.doctorName} 선생님`} />
          <CardRow label="일시" value={card.when} />
        </dl>
        <button
          type="button"
          disabled={!interactive}
          onClick={() => onConfirm(card.confirmTo)}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-45"
        >
          이 내용으로 예약
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          눌러야 예약돼요 — 상담봇이 대신 예약하지 않아요
        </p>
      </div>
    )
  }

  if (card.kind === 'booked') {
    return (
      <div className="animate-chat-in max-w-[92%] rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 shadow-(--elevation-card)">
        <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> 예약이 완료됐어요
        </p>
        <p className="mt-2 text-xs text-muted-foreground">예약번호</p>
        <p className="text-2xl font-black tracking-wide text-foreground">{card.bookingNo}</p>
        <button
          type="button"
          disabled={!interactive}
          onClick={() => onNavigate?.('/questionnaire')}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-45"
        >
          <FileText className="h-4 w-4" aria-hidden="true" /> 사전문진 작성하기
        </button>
      </div>
    )
  }

  if (card.kind === 'handoff') {
    return (
      <div className="animate-chat-in max-w-[92%] rounded-2xl border bg-card p-4 shadow-(--elevation-card)">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          {card.hours === 'in' ? '직원에게 연결했어요' : '문의를 남겼어요'}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {card.hours === 'in'
            ? '담당 직원이 이 상담방에서 이어서 답변해요. 아래 내용을 함께 전달했어요.'
            : '지금은 운영시간 밖이에요. 남겨 주신 내용을 다음 영업일에 이 상담방에서 답변해 드려요.'}
        </p>
        <dl className="mt-3 space-y-2 border-t pt-3">
          {card.summary.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-semibold text-muted-foreground">{s.label}</dt>
              <dd className="text-sm text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  if (card.kind === 'urgent') {
    return (
      <div className="animate-chat-in max-w-[92%] rounded-2xl border-2 border-red-200 bg-red-50 p-4 shadow-(--elevation-card)">
        <p className="flex items-center gap-1.5 text-sm font-bold text-red-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" /> 응급일 수 있어요
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          가슴 통증·호흡곤란·의식 저하 같은 증상은 지체하지 말고 즉시{' '}
          <b className="font-bold">119에 전화</b>하거나 가까운 <b className="font-bold">응급실</b>로
          가세요.
        </p>
        <a
          href="tel:119"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Phone className="h-4 w-4" aria-hidden="true" /> 119 전화하기
        </a>
        <p className="mt-2 text-center text-xs text-red-700/80">
          긴급 여부를 완벽하게 판단하지는 못해요. 조금이라도 위험하면 바로 응급실로 가세요.
        </p>
      </div>
    )
  }

  if (card.kind === 'deptResult') {
    return (
      <div className="animate-chat-in max-w-[92%] rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 shadow-(--elevation-card)">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary/80">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> 안내 진료과
        </p>
        <p className="mt-0.5 text-xl font-black text-foreground">{card.deptName}</p>
        <button
          type="button"
          disabled={!interactive}
          onClick={() => onDeptChosen?.(card.deptId)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-45"
        >
          {card.deptName}로 계속하기 <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )
  }

  // bookingAuth (웹 익명) — 예약은 로그인 필요 행동. 누르면 위젯 위에 인증 모달을 띄운다.
  return (
    <div className="animate-chat-in max-w-[92%] rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 shadow-(--elevation-card)">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary/80">
        <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> 안내 진료과
      </p>
      <p className="mt-0.5 text-xl font-black text-foreground">{card.deptName}</p>
      <p className="mt-2 flex items-center gap-1 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        예약은 본인 확인이 필요해 로그인 후 진행돼요.
      </p>
      <button
        type="button"
        disabled={!interactive}
        onClick={() => onAuthRequired?.({ deptName: card.deptName, resumeTo: card.resumeTo })}
        className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-45"
      >
        {card.deptName} 예약하기
      </button>
    </div>
  )
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold text-foreground">{value}</dd>
    </div>
  )
}
