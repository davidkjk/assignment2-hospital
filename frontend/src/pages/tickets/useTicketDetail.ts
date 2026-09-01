import { useCallback, useEffect, useRef, useState } from 'react'
import { TicketClaimConflict, type TicketStatus } from '../../api/staffChat'
import { TicketNotFound, type StaffTicketDetailApi, type TicketDetail } from '../../api/staffChatDetail'
import { useTicketDetailRealtime, type LiveStatus } from './useTicketDetailRealtime'

// 티켓 상세의 상태 기계 — 열람/재열람·상태·로딩·권한 · 라이브(새 메시지·담당/상태·끊김/복구·입력 중) ·
// 미확인/읽음 · 답변 전송 · 담당 이관 · 별도 종료. 화면(TicketDetail)은 이 훅의 값만 읽어 그린다.
// ⭐ 모르는 상태를 만들어 말하지 않는다(§0): detail이 없으면 statusLabel은 빈 문자열(LOAD-01),
//    이탈·만료로 close를 부르는 타이머를 두지 않는다(STATUS-02·03은 "종료 트리거 아님"을 훅이 보장).

type Phase = 'loading' | 'ready' | 'notfound'
const STATUS_LABEL: Record<TicketStatus, string> = {
  pending: '직원 연결 중',
  in_progress: '직원 상담 중',
  answered: '상담 종료',
}

export function useTicketDetail(
  api: StaffTicketDetailApi,
  ticketId: string,
  opts: { onLoserBackToList?: (msg: string) => void } = {},
) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [live, setLive] = useState<LiveStatus>('connected')
  const [sending, setSending] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [closing, setClosing] = useState(false)
  const onLoser = opts.onLoserBackToList

  // 라이브 콜백이 매 렌더 새로 물려도 최신 detail·live를 보도록 ref로 읽는다(구독은 한 번만 만든다).
  const liveRef = useRef(live)
  liveRef.current = live
  const detailRef = useRef(detail)
  detailRef.current = detail
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setPhase('loading')
    setDetail(null)
    try {
      let d = await api.getDetail(ticketId)
      // OPEN-01: pending·미배정 → 열람이 곧 자동 배정.
      if (d.status === 'pending' && !d.assignee) {
        d = await api.claim(ticketId)
      }
      // OPEN-03: 남의 in_progress → 상세를 열지 않고 목록으로. answered는 아래에서 읽기 전용으로 연다.
      if (d.status === 'in_progress' && !d.isMine) {
        onLoser?.('이미 다른 직원이 맡았어요.')
        setPhase('loading')
        return
      }
      setDetail(d)
      setPhase('ready')
    } catch (e) {
      if (e instanceof TicketClaimConflict) {
        onLoser?.('이미 다른 직원이 맡았어요.') // OPEN-02: 경쟁 패자
        return
      }
      if (e instanceof TicketNotFound) {
        setPhase('notfound') // ERR-02
        return
      }
      setPhase('notfound')
    }
  }, [api, ticketId, onLoser])

  useEffect(() => {
    void load()
  }, [load])

  const isReadOnly = detail?.status === 'answered' // OPEN-03 answered = 읽기 전용
  const statusLabel = detail ? STATUS_LABEL[detail.status] : '' // LOAD-01: detail 없으면 단정하지 않음

  const patchDetail = useCallback(
    (fn: (d: TicketDetail) => TicketDetail) => setDetail((d) => (d ? fn(d) : d)),
    [],
  )
  const mergeMessages = useCallback(
    (msgs: TicketDetail['messages']) => patchDetail((d) => ({ ...d, messages: msgs })),
    [patchDetail],
  )

  // ── 라이브 (LIVE-01~04·TYPING-01) ──────────────────────────────────────────
  const reloadConversation = useCallback(async () => {
    try {
      const d = await api.getDetail(ticketId)
      mergeMessages(d.messages) // LIVE-01: 최신 대화만 반영
    } catch {
      /* LIVE-03: 실패를 성공으로 바꾸지 않음 — 기존 유지 */
    }
  }, [api, ticketId, mergeMessages])

  const reloadTicketMeta = useCallback(async () => {
    try {
      const d = await api.getDetail(ticketId)
      // LIVE-02: 담당/상태/미확인만 갱신, 화면 이동 없음.
      patchDetail((cur) => ({ ...cur, status: d.status, assignee: d.assignee, isMine: d.isMine }))
    } catch {
      /* 유지 */
    }
  }, [api, ticketId, patchDetail])

  const onLiveChange = useCallback(
    (next: LiveStatus) => {
      setLive(next)
      if (next === 'connected') {
        // LIVE-04: 복구 시 대화·메타 재조회로 누락·중복 정합화.
        void reloadConversation()
        void reloadTicketMeta()
      }
    },
    [reloadConversation, reloadTicketMeta],
  )

  useTicketDetailRealtime(
    () => {
      if (detailRef.current && liveRef.current === 'connected') void reloadConversation()
    },
    () => {
      if (detailRef.current && liveRef.current === 'connected') void reloadTicketMeta()
    },
    onLiveChange,
  )

  // TYPING-01: 타이핑 시 입력 중 신호, 유휴 3초면 해제(디바운스, 확정값).
  const setTyping = useCallback((emit: (on: boolean) => void) => {
    emit(true)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => emit(false), 3000)
  }, [])

  // UNREAD-02: 상세를 열어 미확인 환자 메시지를 보면 서버 확인 상태를 갱신(여러 기기는 서버로 정합화).
  const markReadVisible = useCallback(async () => {
    const unread = detailRef.current?.messages.filter((m) => m.sender === 'patient' && m.staffUnread) ?? []
    for (const m of unread) {
      try {
        await api.markRead(ticketId, m.id)
      } catch {
        /* 재연결 시 재조회로 정합 */
      }
    }
    if (unread.length) {
      patchDetail((d) => ({
        ...d,
        messages: d.messages.map((m) => (m.staffUnread ? { ...m, staffUnread: false } : m)),
      }))
    }
  }, [api, ticketId, patchDetail])

  // REPLY-02/04: 멱등 전송·중복 방지. status 불변(answered로 안 바꿈). 실패는 rethrow → ReplyBox가 draft 보존(REPLY-03).
  const send = useCallback(
    async (body: string) => {
      if (sending) return
      setSending(true)
      const requestId = crypto.randomUUID()
      try {
        const msg = await api.sendMessage(ticketId, body, requestId)
        patchDetail((d) => ({ ...d, messages: [...d.messages, msg] }))
      } finally {
        setSending(false)
      }
    },
    [api, ticketId, sending, patchDetail],
  )

  // REASSIGN-02: assigned_staff_id만 바꾸고 in_progress 유지. 실패는 rethrow → ReassignControl이 기존 유지(REASSIGN-04).
  const reassign = useCallback(
    async (toStaffId: string) => {
      setReassigning(true)
      try {
        const d = await api.reassignTicket(ticketId, toStaffId)
        patchDetail((cur) => ({ ...cur, assignee: d.assignee, isMine: d.isMine, status: d.status }))
      } finally {
        setReassigning(false)
      }
    },
    [api, ticketId, patchDetail],
  )

  // CLOSE-02: answered는 여기서만. 실패는 rethrow → CloseTicketButton이 in_progress 유지 표시(CLOSE-04).
  const close = useCallback(async () => {
    setClosing(true)
    try {
      await api.closeTicket(ticketId)
      patchDetail((d) => ({ ...d, status: 'answered' }))
    } finally {
      setClosing(false)
    }
  }, [api, ticketId, patchDetail])

  return {
    phase,
    detail,
    isReadOnly,
    statusLabel,
    live,
    reload: load,
    reloadConversation,
    onLiveChange,
    setTyping,
    markReadVisible,
    send,
    sending,
    reassign,
    reassigning,
    close,
    closing,
    listActiveStaff: api.listActiveStaff,
    patchDetail,
    mergeMessages,
  }
}
