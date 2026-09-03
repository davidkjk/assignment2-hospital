import { useEffect, useRef, useState } from 'react'
import type { InboxTicket } from '../../api/staffChat'
import type { StaffTicketDetailApi } from '../../api/staffChatDetail'
import { useTicketDetail } from './useTicketDetail'
import { HandoffSummary } from './HandoffSummary'
import { TicketConversation, messageBadges, ContactBanner } from './TicketConversation'
import { ReplyBox } from './ReplyBox'
import { ReassignControl } from './ReassignControl'
import { CloseTicketButton } from './CloseTicketDialog'

// 티켓 상세 조립(LAYOUT-01) — 위→아래: 담당 이관 → 인계 요약 → 전체 대화 → 답변/보내기 → (따로) 상담 종료.
// 라이브 범위는 훅이 제공하는 것만(SCOPE-01): 새 메시지·상태·입력 중·재전송·재연결·알림·미확인·자동 배정/이관·종료.
// ⛔ 온라인 초록 점·사진·파일·음성·반응 없음. 이 컴포넌트가 Task 16 detailSlot의 본체다. 시각은 데모 tickets 상세.

export function TicketDetail(props: {
  api: StaffTicketDetailApi
  ticket: InboxTicket
  onLoserBackToList: (msg: string) => void
  /** 봇 답변 「잘못된 답변 신고」 → 오답 신고 작성(별도 전체 화면, NAV-STFSUP-06·Task 21). 없으면 버튼을 두지 않는다. */
  onReportBad?: (messageId: string) => void
}) {
  const { api, ticket, onLoserBackToList, onReportBad } = props
  const d = useTicketDetail(api, ticket.id, { onLoserBackToList })
  const [draft, setDraft] = useState('')

  // SCROLL-01: 새 메시지가 늘면(특히 내가 방금 보낸 답변) 대화 맨 아래로 스크롤한다.
  // 안 하면 보낸 글이 스크롤 영역 밑에 접혀 "아무 일도 안 일어난 것"처럼 보인다.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [d.detail?.messages.length])

  // UNREAD-02: 상세를 열어 미확인 환자 메시지를 보면 서버 확인 상태 갱신.
  useEffect(() => {
    if (d.phase === 'ready') void d.markReadVisible()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.phase])

  if (d.phase === 'loading') {
    // LOAD-01: '처리 중' 단정 없이 로딩만.
    return (
      <div className="flex h-full items-center justify-center">
        <p role="status" className="text-sm text-muted-foreground">
          불러오는 중…
        </p>
      </div>
    )
  }
  if (d.phase === 'notfound') {
    // ERR-02: 내용 노출 없이 복귀 경로.
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">문의를 찾을 수 없습니다</p>
        <button
          type="button"
          onClick={() => onLoserBackToList('')}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          티켓함으로
        </button>
      </div>
    )
  }

  const detail = d.detail!
  return (
    <article aria-label="티켓 상세" className="flex h-full flex-col">
      {/* 상태·연결 표시 */}
      <div className="flex items-center gap-2 px-4 pt-3 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            d.isReadOnly ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
          }`}
        >
          {d.statusLabel}
        </span>
        {d.live === 'disconnected' && <span className="text-amber-700">· 연결 불안정 · 최신 상태가 아닐 수 있습니다</span>}
      </div>

      {/* ① 담당 이관(맨 위) — 읽기 전용이면 이관 없음 */}
      {!d.isReadOnly && (
        <ReassignControl reason={detail.reason} busy={d.reassigning} loadStaff={d.listActiveStaff} onReassign={d.reassign} />
      )}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* ② 인계 요약 + 연락처 */}
        <div className="space-y-2">
          <HandoffSummary summary={detail.summary} assignee={detail.assignee} />
          <ContactBanner contact={detail.contact} />
        </div>

        {/* ③ 전체 대화(주 영역) */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">전체 대화</h3>
          <TicketConversation
            messages={detail.messages}
            convError={false}
            onRetryConv={d.reloadConversation}
            renderBadges={(m) =>
              messageBadges(m).map((t) => (
                <em key={t} className="mt-1 block text-[11px] not-italic opacity-90">
                  {t}
                </em>
              ))
            }
            renderFooter={
              onReportBad
                ? (m) =>
                    m.sender === 'ai' ? (
                      <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => onReportBad(m.id)}>
                        잘못된 답변 신고
                      </button>
                    ) : null
                : undefined
            }
          />
        </section>
      </div>

      {/* ④ 답변 입력/보내기 */}
      <ReplyBox readOnly={d.isReadOnly} sending={d.sending} onSend={d.send} onDraftChange={setDraft} />

      {/* ⑤ 따로 상담 종료(분리) — 읽기 전용이면 없음 */}
      {!d.isReadOnly && (
        <CloseTicketButton closing={d.closing} hasUnsentDraft={draft.trim() !== ''} onConfirmClose={d.close} />
      )}
    </article>
  )
}
