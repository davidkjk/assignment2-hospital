import { useEffect, useRef, useState } from 'react'
import type { InboxTicket } from '../../api/staffChat'
import type { StaffTicketDetailApi } from '../../api/staffChatDetail'
import { useTicketDetail } from './useTicketDetail'
import { HandoffSummary } from './HandoffSummary'
import { TicketConversation, messageBadges, ContactBanner } from './TicketConversation'
import { UserRound } from '../../components/icons'
import { ReplyBox } from './ReplyBox'
import { ReassignControl } from './ReassignControl'
import { CloseTicketButton } from './CloseTicketDialog'
import { useTypingChannel } from './useTypingChannel'
import { PatientPresence } from './PatientPresence'
import { LoadingState } from '../../components/LoadingState'

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
  // TICKET-DETAIL-TYPING-01: 답변 작성 중이면 같은 thread의 broadcast로 "직원 입력 중"을 환자 상담방에 보낸다.
  // 유휴 3초 해제(디바운스)는 d.setTyping이, 송신 transport는 send가 담당한다.
  // [TICKET-DETAIL-PATIENT-PRESENCE-01·PATIENT-TYPING-01] 같은 채널에서 환자 접속·입력 중도 구독해 표시한다.
  // [F6] onPatientRead: 환자/익명이 읽으면(서버 patient_read 신호) 대화를 재조회해 '환자 미확인'을 실시간으로 걷는다.
  const { send: sendTyping, patientTyping, patientViewing } = useTypingChannel(d.detail?.threadId, d.reloadConversation)

  // SCROLL-01: 새 메시지가 늘면(특히 내가 방금 보낸 답변) 대화 맨 아래로 스크롤한다.
  // 안 하면 보낸 글이 스크롤 영역 밑에 접혀 "아무 일도 안 일어난 것"처럼 보인다.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [d.detail?.messages.length])

  // UNREAD-02: 상세를 열어 미확인 환자 메시지를 보면 서버 확인 상태 갱신. [F6] 보는 중 새 환자 메시지가
  //   도착해도(메시지 수 증가) 다시 확인 처리한다 — 예전엔 진입 시 1회만 해서 이후 도착분이 계속 '미확인'으로 남았다.
  useEffect(() => {
    if (d.phase === 'ready') void d.markReadVisible()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.phase, d.detail?.messages.length])

  if (d.phase === 'loading') {
    // LOAD-01: '처리 중' 단정 없이 로딩만.
    return <LoadingState variant="card" message="대화를 불러오는 중입니다" />
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
  // G3(2026-09-11, 사용자 결정): 신원 배지는 로그인 환자의 계정 실명(contact.anonymous=false)과
  //   익명 웹 상담 신청자의 자기입력 이름(anonymous=true) 둘 다 보인다. ~~F7: 익명은 이름 없음~~ 뒤집음 —
  //   앱(로그인)만 뜨고 웹챗 입력 이름이 안 떠 직원이 상대를 못 알아본 문제. 자기입력은 미검증이라 라벨을
  //   '신청자'로(계정 실명은 '환자') 구분한다. 서버가 이름을 안 주면(미기재) null → 배지 없음.
  const requesterName = detail.contact.name
  const requesterRole = detail.contact.anonymous ? '신청자' : '환자'
  return (
    <article aria-label="티켓 상세" className="flex h-full flex-col">
      {/* 상태·연결 표시 */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-xs">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            d.isReadOnly ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
          }`}
        >
          {d.statusLabel}
        </span>
        {/* TICKET-DETAIL-APPLICANT-01(G3 개정): 답변 상대를 헤더로 끌어올려 스크롤 없이 누구인지 보이게 한다.
            상태 pill(primary=상태)과 구분되게 조용한 중립 pill + 사람 아이콘(=신원). 로그인=계정 실명('환자'),
            익명 웹=신청자 자기입력 이름('신청자', 미검증). */}
        {requesterName && (
          <span
            aria-label={requesterRole}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground"
          >
            <UserRound className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{requesterRole}</span>
            {requesterName}
          </span>
        )}
        {d.live === 'disconnected' && <span className="text-amber-700">· 연결 불안정 · 최신 상태가 아닐 수 있습니다</span>}
        {/* [TICKET-DETAIL-PATIENT-PRESENCE-01·PATIENT-TYPING-01] 환자 접속·입력 중을 상단에 라이브 표시 */}
        <PatientPresence typing={patientTyping} viewing={patientViewing} />
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

      {/* ④ 답변 입력/보내기 — 입력이 바뀔 때마다 타이핑 신호(디바운스는 훅) */}
      <ReplyBox
        readOnly={d.isReadOnly}
        sending={d.sending}
        onSend={d.send}
        onDraftChange={(v) => {
          setDraft(v)
          d.setTyping(sendTyping) // TICKET-DETAIL-TYPING-01
        }}
      />

      {/* ⑤ 따로 상담 종료(분리) — 읽기 전용이면 없음 */}
      {!d.isReadOnly && (
        <CloseTicketButton closing={d.closing} hasUnsentDraft={draft.trim() !== ''} onConfirmClose={d.close} />
      )}
    </article>
  )
}
