import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from '../../components/icons'
import { StaffPage, Tag, btnLink } from '../../components/staff-ui'
import { staffChatLogApi, fetchThreadConversation, type ChatLogApi, type ChatLogRow } from '../../api/staffChatLog'
import type { ConvMessage } from '../../api/staffChatDetail'
import { TicketConversation } from '../tickets/TicketConversation'
import { useChatLogs } from './useChatLogs'
import { ChatLogList } from './ChatLogList'
import { ChatLogSources } from './ChatLogSources'
import { channelText, routeText } from './labels'

// 상담봇 기록 (/chatlog) — CHATLOG-LIST-*. 관리자 전용(기록 그룹, DEMO-REVIEW F-1).
// 앱·웹 대화를 한 목록에(SCOPE-01). 채널·갈래 필터. 행 클릭 → 원문·AI 답변·답변 근거(DETAIL-01).
// ⭐ 대화 원문은 직원 콘솔 말풍선(TicketConversation)을 그대로 재사용한다 — 새 렌더러를 만들지 않는다.
// 시각 뼈대 = 데모 chatlog/Chatlog.tsx(필터 한 줄 + 목록 + sticky 상세 패널).

export function ChatlogPage({
  api = staffChatLogApi,
  fetchConversation = fetchThreadConversation,
}: {
  api?: ChatLogApi
  fetchConversation?: (threadId: string) => Promise<ConvMessage[]>
}) {
  const logs = useChatLogs(api)
  const [selected, setSelected] = useState<ChatLogRow | null>(null)

  const open = (threadId: string) => setSelected(logs.rows.find((r) => r.threadId === threadId) ?? null)

  return (
    <StaffPage max="max-w-full" testid="staff-chatlog">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <ChatLogList
            rows={logs.rows}
            phase={logs.phase}
            filters={logs.filters}
            onFilter={logs.setFilter}
            onOpen={open}
            onRetry={logs.retry}
            counts={logs.counts}
            period={logs.period}
            onPeriod={logs.setPeriod}
          />
        </div>
        {selected && (
          <ChatlogDetail key={selected.threadId} row={selected} api={api} fetchConversation={fetchConversation} onClose={() => setSelected(null)} />
        )}
      </div>
    </StaffPage>
  )
}

function ChatlogDetail({
  row,
  api,
  fetchConversation,
  onClose,
}: {
  row: ChatLogRow
  api: ChatLogApi
  fetchConversation: (threadId: string) => Promise<ConvMessage[]>
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ConvMessage[]>([])
  const [convError, setConvError] = useState(false)
  const [reportOf, setReportOf] = useState<string | null>(null)
  const fetchRef = useRef(fetchConversation)
  fetchRef.current = fetchConversation

  const load = useCallback(async () => {
    setConvError(false)
    try {
      setMessages(await fetchRef.current(row.threadId))
    } catch {
      setConvError(true) // ERR-01: 대화 영역에만 오류
    }
  }, [row.threadId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <aside className="sticky top-4 w-96 shrink-0 self-start rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag>{channelText(row.channel)}</Tag>
          <span className="text-sm font-semibold">{routeText(row.routeTaken)}</span>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
        <TicketConversation
          messages={messages}
          convError={convError}
          onRetryConv={() => void load()}
          // 봇(ai) 답변 아래에 승인 근거 + [잘못된 답변 신고] — 데모 TurnView 계승, DETAIL-01·SOURCE-*.
          renderFooter={(m) =>
            m.sender === 'ai' ? (
              <div>
                <ChatLogSources api={api} messageId={m.id} />
                <button type="button" className={`${btnLink} mt-1`} onClick={() => setReportOf(m.id)}>
                  잘못된 답변 신고
                </button>
              </div>
            ) : null
          }
        />
      </div>

      {/* 오답 신고 폼(BADRPT)은 Task 21 — 지금은 안내만(막다른 길 방지). */}
      {reportOf && (
        <div className="border-t border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          오답 신고는 <b>오답 처리함</b>(다음 개발 단계)에서 작성합니다.
          <button type="button" className={`${btnLink} ml-2`} onClick={() => setReportOf(null)}>
            닫기
          </button>
        </div>
      )}
    </aside>
  )
}
