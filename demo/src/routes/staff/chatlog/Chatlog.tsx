import { useState } from 'react'
import { Sparkles, UserRound, FileText, FlagIcon, X, Check, MessageCircle } from '@/components/icons'
import { StaffPage, PeriodSelect, EmptyState, Tag, btnPrimary, btnGhost, btnLink } from '../_ui'
import {
  CHAT_RECORDS,
  filterChatRecords,
  CHANNEL_LABEL,
  ROUTE_LABEL,
  type ChatRecord,
  type ChatTurn,
  type ChannelFilter,
  type RouteFilter,
} from './mockData'

// 상담봇 기록 (/staff/chatlog) — CHATLOG-LIST-*.
// 앱+웹 상담을 한 목록에(SCOPE-01). 채널·갈래 필터. 행 클릭 → 원문·AI 답변·답변 근거.
// 봇 답변엔 근거 자료(없으면 "근거 자료 없음", SOURCE-02) + [잘못된 답변 신고](BADRPT-*).
// data-testid="staff-chatlog".

const CHANNEL_TABS: { key: ChannelFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'app', label: '앱' },
  { key: 'web', label: '웹' },
]
const ROUTE_TABS: { key: RouteFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'ai_resolved', label: 'AI 해결' },
  { key: 'staff_handoff', label: '직원 연결' },
  { key: 'booking_support', label: '예약 상담' },
]
// 갈래별 색점 — 목록·필터가 같은 뜻으로 읽히게 (구조가 정보다)
const ROUTE_DOT: Record<string, string> = {
  ai_resolved: '#0B6E70', // 딥틸(AI가 스스로 해결)
  staff_handoff: '#B45309', // 앰버(사람에게 넘어감)
  booking_support: '#6D4F9B', // 보라(예약 처리)
}

export function Chatlog() {
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [route, setRoute] = useState<RouteFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = filterChatRecords(CHAT_RECORDS, channel, route)
  const selected = rows.find((r) => r.id === selectedId) ?? null

  // 갈래별 건수 — 지금 채널 안에서 센다(칩이 정보가 되도록)
  const inChannel = CHAT_RECORDS.filter((r) => channel === 'all' || r.channel === channel)
  const routeCount = (k: RouteFilter) => (k === 'all' ? inChannel.length : inChannel.filter((r) => r.routeTaken === k).length)

  return (
    <StaffPage max="max-w-full" testid="staff-chatlog">
      {/* 필터 한 줄: 갈래(색점+건수) · 채널 · 기간 — 칩·탭 나열 대신 한 벌의 도구로 */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="inline-flex items-center gap-0.5 rounded-xl border border-border/70 bg-card p-1 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {ROUTE_TABS.map((r) => {
            const active = route === r.key
            const n = routeCount(r.key)
            return (
              <button
                key={r.key}
                onClick={() => setRoute(r.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {r.key !== 'all' && (
                  <span className="h-2 w-2 rounded-full" style={{ background: active ? 'currentColor' : ROUTE_DOT[r.key] }} />
                )}
                {r.label}
                <span className={`tabular-nums text-xs ${active ? 'opacity-80' : 'opacity-60'}`}>{n}</span>
              </button>
            )
          })}
        </div>

        <div className="inline-flex items-center rounded-lg border border-border/70 bg-card p-0.5">
          {CHANNEL_TABS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChannel(c.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                channel === c.key ? 'bg-muted text-foreground shadow-[0_1px_1px_rgba(16,45,50,0.06)]' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <PeriodSelect />
        </div>
      </div>

      <div className="flex items-start gap-3">
        {/* 목록 */}
        <div className="min-w-0 flex-1 self-start overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="grid grid-cols-[56px_96px_1fr_92px] items-center gap-3 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>채널</span>
            <span>갈래</span>
            <span>질문 요약</span>
            <span className="text-right">시각</span>
          </div>
          {rows.length === 0 ? (
            <EmptyState title="조건에 맞는 상담 기록이 없습니다" hint="채널·갈래 필터를 바꿔 보세요." />
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`grid w-full grid-cols-[56px_96px_1fr_92px] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-b-0 ${
                  r.id === selectedId ? 'bg-primary/5' : 'hover:bg-muted'
                }`}
              >
                <span><Tag>{CHANNEL_LABEL[r.channel]}</Tag></span>
                <span className="text-sm text-muted-foreground">{ROUTE_LABEL[r.routeTaken]}</span>
                <span className="truncate font-medium">{r.summary}</span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">{r.occurredLabel}</span>
              </button>
            ))
          )}
        </div>

        {/* 상세 패널 */}
        {selected && <RecordDetail r={selected} onClose={() => setSelectedId(null)} />}
      </div>
    </StaffPage>
  )
}

function RecordDetail({ r, onClose }: { r: ChatRecord; onClose: () => void }) {
  const [reportOf, setReportOf] = useState<ChatTurn | null>(null)
  return (
    <aside className="sticky top-4 w-96 shrink-0 self-start rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag>{CHANNEL_LABEL[r.channel]}</Tag>
          <span className="text-sm font-semibold">{ROUTE_LABEL[r.routeTaken]}</span>
          <span className="text-xs text-muted-foreground">{r.participant}</span>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[calc(100vh-14rem)] space-y-3 overflow-y-auto p-4">
        {r.turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} onReport={() => setReportOf(turn)} />
        ))}
      </div>

      {reportOf && <ReportForm turn={reportOf} onClose={() => setReportOf(null)} />}
    </aside>
  )
}

function TurnView({ turn, onReport }: { turn: ChatTurn; onReport: () => void }) {
  const isBot = turn.sender === 'AI'
  const isStaff = turn.sender === '직원'
  const Icon = isBot ? Sparkles : UserRound
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        {isBot ? <Icon className="h-3 w-3" /> : isStaff ? null : <Icon className="h-3 w-3" />}
        {turn.sender} · {turn.time}
      </div>
      <div className={`rounded-xl px-3 py-2 text-sm ${isBot ? 'bg-violet-50 text-violet-900' : isStaff ? 'bg-primary/10 text-foreground' : 'bg-muted'}`}>
        {turn.text}
      </div>
      {isBot && (
        <div className="mt-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="h-3 w-3" /> 답변 근거
          </div>
          {turn.sources && turn.sources.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {turn.sources.map((s) => (
                <li key={s} className="text-xs">· {s}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">근거 자료 없음</p>
          )}
          <button className={`${btnLink} mt-1 inline-flex items-center gap-1`} onClick={onReport}>
            <FlagIcon className="h-3 w-3" /> 잘못된 답변 신고
          </button>
        </div>
      )}
    </div>
  )
}

function ReportForm({ turn, onClose }: { turn: ChatTurn; onClose: () => void }) {
  const [correction, setCorrection] = useState('')
  const [asExample, setAsExample] = useState(false)
  const [saved, setSaved] = useState(false)

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">잘못된 답변 신고</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        {saved ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <Check className="mx-auto h-6 w-6 text-emerald-600" />
            <p className="mt-1 text-sm font-medium text-emerald-800">오답 신고 처리함에 저장했습니다.</p>
            <p className="mt-0.5 text-xs text-emerald-700">아직 상담봇에 반영된 것은 아닙니다. 관리자 검토 후 반영됩니다.</p>
            <button className={`${btnGhost} mx-auto mt-3`} onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <MessageCircle className="h-3 w-3" /> 신고 대상 (봇 답변)
              </div>
              <p className="mt-0.5 text-sm">{turn.text}</p>
            </div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">올바른 안내</label>
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              rows={4}
              placeholder="환자에게 어떻게 안내했어야 하는지 적습니다"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={asExample} onChange={(e) => setAsExample(e.target.checked)} />
              향후 유사 질문 예시로도 사용
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnGhost} onClick={onClose}>취소</button>
              <button className={btnPrimary} onClick={() => setSaved(true)} disabled={!correction.trim()}>신고</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
