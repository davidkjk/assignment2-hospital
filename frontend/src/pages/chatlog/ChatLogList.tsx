import type { ChatLogRow, ChatLogQuery, Channel, RouteTaken } from '../../api/staffChatLog'
import { EmptyState, Segmented, Tag } from '../../components/staff-ui'
import { channelText, routeText, routeDot } from './labels'

// 상담봇 기록 목록(CHATLOG-LIST) — 앱·웹 대화를 한 목록에(SCOPE-01). 채널·갈래 필터(FILTER-01/02).
// 행은 채널·갈래를 텍스트로 구분하고 열 수 있다(ROW-01). 0건은 조회 실패와 구분(EMPTY-01).
// 시각 뼈대 = 데모 chatlog/Chatlog.tsx(필터 한 줄 + 4열 그리드).

// route_taken 5값을 필터 세그먼트로(데모 3그룹 대신 서버 enum 그대로 — 플랜 우선).
const ROUTE_KEYS: RouteTaken[] = ['emergency', 'rag', 'department_guide', 'agent', 'handoff']
const CHANNEL_OPTS: { key: 'all' | Channel; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'app', label: '앱' },
  { key: 'web', label: '웹' },
]

const fmtAt = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso // 계약 밖 값도 원문 유지
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

export interface ChatLogListProps {
  rows: ChatLogRow[]
  phase: 'loading' | 'ready' | 'empty' | 'error'
  filters: ChatLogQuery
  onFilter: (patch: Partial<ChatLogQuery>) => void
  onOpen: (threadId: string) => void
  onRetry?: () => void
}

export function ChatLogList({ rows, phase, filters, onFilter, onOpen, onRetry }: ChatLogListProps) {
  const activeChannel: 'all' | Channel = filters.channel ?? 'all'
  const activeRoute = filters.routeTaken ?? 'all'

  return (
    <div>
      {/* 필터 한 줄: 갈래(색점) · 채널 · 기간 — 칩 나열 대신 한 벌의 도구로(데모 계승) */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div
          role="group"
          aria-label="갈래"
          className="inline-flex items-center gap-0.5 rounded-xl border border-border/70 bg-card p-1 shadow-[0_1px_2px_rgba(16,45,50,0.04)]"
        >
          <RouteChip label="전체" active={activeRoute === 'all'} onClick={() => onFilter({ routeTaken: undefined })} />
          {ROUTE_KEYS.map((k) => (
            <RouteChip
              key={k}
              label={routeText(k)}
              dot={routeDot(k)}
              active={activeRoute === k}
              onClick={() => onFilter({ routeTaken: k })}
            />
          ))}
        </div>

        <div aria-label="채널">
          <Segmented
            options={CHANNEL_OPTS}
            value={activeChannel}
            onChange={(k) => onFilter({ channel: k === 'all' ? undefined : (k as Channel) })}
          />
        </div>
        {/* ⏳ 기간 선택기(데모 시각) 이월 — 백엔드 /logs 계약에 date range 없음(플랜 스코프 밖). */}
      </div>

      {/* 목록 — 4열 그리드(채널 | 갈래 | 질문 요약 | 시각) */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="grid grid-cols-[56px_112px_1fr_92px] items-center gap-3 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-sm font-medium text-muted-foreground">
          <span>채널</span>
          <span>갈래</span>
          <span>질문 요약</span>
          <span className="text-right">시각</span>
        </div>

        {phase === 'loading' ? (
          <div aria-label="상담 기록 로딩" className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden="true" className="h-9 rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : phase === 'error' ? (
          // ERR-01: 0건으로 위장하지 않는다 — 오류+재시도.
          <div role="alert" className="px-6 py-16 text-center text-sm">
            <p className="text-muted-foreground">상담 기록을 불러오지 못했습니다</p>
            {onRetry && (
              <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-muted">
                다시 시도
              </button>
            )}
          </div>
        ) : rows.length === 0 ? (
          // EMPTY-01: 조회 실패와 구분되는 0건 문구.
          <EmptyState title="조건에 맞는 상담 기록이 없습니다" hint="채널·갈래 필터를 바꿔 보세요." />
        ) : (
          rows.map((r) => (
            <button
              key={r.threadId}
              type="button"
              onClick={() => onOpen(r.threadId)}
              className="grid w-full grid-cols-[56px_112px_1fr_92px] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted"
            >
              <span>
                <Tag>{channelText(r.channel)}</Tag>
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                {routeDot(r.routeTaken) && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: routeDot(r.routeTaken) }} />
                )}
                {routeText(r.routeTaken)}
              </span>
              <span className="truncate font-medium">{r.summary}</span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">{fmtAt(r.at)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function RouteChip({ label, dot, active, onClick }: { label: string; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: active ? 'currentColor' : dot }} />}
      {label}
    </button>
  )
}
