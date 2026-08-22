import { useMemo, useState } from 'react'
import { CheckCircle2, FileText, FlagIcon, MessageCircle, SealQuestionIcon } from '@/components/icons'
import { EmptyState, PageHead, Panel, Segmented, StaffPage, StatusBadge, Tag, btnGhost, btnPrimary } from '../_ui'
import {
  CHANNEL_LABEL,
  CHAT_RECORDS,
  ROUTE_LABEL,
  filterChatRecords,
  type ChannelFilter,
  type ChatRecord,
  type ChatTurn,
  type RouteFilter,
} from './mockData'

// 전체 상담 기록 (/staff/chatlog) — CHATLOG-LIST-*.
// data-testid="staff-chatlog". 앱·웹 통합 목록에서 원문, AI 답변, 승인 근거를 함께 확인한다.

const CHANNELS: { key: ChannelFilter; label: string }[] = [
  { key: 'all', label: '전체 채널' }, { key: 'app', label: '앱' }, { key: 'web', label: '웹' },
]
const ROUTES: { key: RouteFilter; label: string }[] = [
  { key: 'all', label: '전체 갈래' }, { key: 'ai_resolved', label: 'AI 해결' },
  { key: 'staff_handoff', label: '직원 연결' }, { key: 'booking_support', label: '예약 상담' },
]

function RecordRow({ record, selected, onSelect }: { record: ChatRecord; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 ${selected ? 'bg-primary/10' : ''}`}>
      <div className="flex items-center gap-2">
        <Tag className="!bg-primary/10 !text-primary">{CHANNEL_LABEL[record.channel]}</Tag>
        <StatusBadge status={ROUTE_LABEL[record.routeTaken]} tone={record.routeTaken === 'ai_resolved' ? 'green' : record.routeTaken === 'staff_handoff' ? 'sky' : 'amber'} />
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{record.occurredLabel}</span>
      </div>
      <div className="mt-2 font-semibold leading-5">{record.summary}</div>
      <div className="mt-1 text-xs text-muted-foreground">{record.participant} · {record.id}</div>
    </button>
  )
}

function SourceList({ turn }: { turn: ChatTurn }) {
  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold"><FileText className="h-3.5 w-3.5 text-primary" />답변 근거</div>
      {turn.sources && turn.sources.length > 0 ? (
        <ul className="mt-1 space-y-1">{turn.sources.map((source) => <li key={source} className="text-xs text-muted-foreground">승인 자료 · {source}</li>)}</ul>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">근거 자료 없음</div>
      )}
    </div>
  )
}

function RecordDetail({ record }: { record: ChatRecord }) {
  const [reportingTurn, setReportingTurn] = useState<ChatTurn | null>(null)
  const [correction, setCorrection] = useState('')
  const [useAsExample, setUseAsExample] = useState(true)
  const [reportedIds, setReportedIds] = useState<string[]>([])
  const [notice, setNotice] = useState('')

  function submitReport() {
    if (!reportingTurn || reportedIds.includes(reportingTurn.id)) return
    setReportedIds((ids) => [...ids, reportingTurn.id])
    setNotice('오답 신고 처리함에 저장했습니다. 상담봇에는 아직 반영되지 않았습니다.')
    setReportingTurn(null)
    setCorrection('')
  }

  return (
    <div className="space-y-3">
      <Panel
        title={<span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" />상담 상세</span>}
        action={<div className="flex items-center gap-2"><Tag>{CHANNEL_LABEL[record.channel]}</Tag><StatusBadge status={ROUTE_LABEL[record.routeTaken]} /></div>}
      >
        <div className="text-sm font-semibold">{record.summary}</div>
        <div className="mt-1 text-xs text-muted-foreground">{record.occurredLabel} · {record.participant} · {record.id}</div>
      </Panel>

      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-border/70 bg-primary/10 px-4 py-3 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}
        </div>
      )}

      <Panel title="상담 원문 · AI 답변">
        <ol className="space-y-3">
          {record.turns.map((turn) => {
            const isPatient = turn.sender === '환자'
            const isReported = reportedIds.includes(turn.id)
            return (
              <li key={turn.id} className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[82%] rounded-xl px-3 py-2 text-sm ${isPatient ? 'bg-muted' : turn.sender === 'AI' ? 'border border-border bg-card' : 'bg-primary text-primary-foreground'}`}>
                  <div className={`mb-1 text-xs font-semibold ${turn.sender === '직원' ? 'text-primary-foreground' : 'text-muted-foreground'}`}>{turn.sender}</div>
                  <div>{turn.text}</div>
                  <div className={`mt-1 text-right text-[11px] ${turn.sender === '직원' ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{turn.time}</div>
                  {turn.sender === 'AI' && (
                    <>
                      <SourceList turn={turn} />
                      <div className="mt-2 flex justify-end">
                        <button disabled={isReported} onClick={() => { setReportingTurn(turn); setNotice('') }} className={btnGhost}>
                          <FlagIcon className="h-4 w-4 text-primary" />{isReported ? '신고 완료' : '잘못된 답변 신고'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </Panel>

      {reportingTurn && (
        <Panel title={<span className="flex items-center gap-2"><SealQuestionIcon className="h-4 w-4 text-primary" />잘못된 답변 신고</span>}>
          <div className="rounded-lg bg-muted px-3 py-2 text-sm"><div className="text-xs font-medium text-muted-foreground">신고 대상 AI 답변</div><div className="mt-1">{reportingTurn.text}</div></div>
          <label className="mt-3 block text-xs font-medium text-muted-foreground">올바른 안내</label>
          <textarea value={correction} onChange={(event) => setCorrection(event.target.value)} rows={3} placeholder="환자에게 안내해야 할 올바른 내용을 작성하세요" className="mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={useAsExample} onChange={(event) => setUseAsExample(event.target.checked)} className="h-4 w-4 accent-primary" />향후 유사 질문 예시로도 사용</label>
          <div className="mt-3 flex justify-end gap-2"><button onClick={() => { setReportingTurn(null); setCorrection('') }} className={btnGhost}>취소</button><button onClick={submitReport} className={btnPrimary}>신고 저장</button></div>
        </Panel>
      )}
    </div>
  )
}

export function Chatlog() {
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [route, setRoute] = useState<RouteFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(CHAT_RECORDS[0]?.id ?? null)
  const records = useMemo(() => filterChatRecords(CHAT_RECORDS, channel, route), [channel, route])
  const selected = CHAT_RECORDS.find((record) => record.id === selectedId) ?? null

  function changeChannel(value: ChannelFilter) {
    setChannel(value)
    setSelectedId(filterChatRecords(CHAT_RECORDS, value, route)[0]?.id ?? null)
  }

  function changeRoute(value: RouteFilter) {
    setRoute(value)
    setSelectedId(filterChatRecords(CHAT_RECORDS, channel, value)[0]?.id ?? null)
  }

  return (
    <StaffPage testid="staff-chatlog" max="max-w-[1500px]">
      <PageHead title="전체 상담 기록" sub="앱과 웹 상담의 원문, AI 답변, 승인 근거를 한곳에서 확인합니다" />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={CHANNELS} value={channel} onChange={changeChannel} count={(value) => filterChatRecords(CHAT_RECORDS, value, route).length} />
        <Segmented options={ROUTES} value={route} onChange={changeRoute} count={(value) => filterChatRecords(CHAT_RECORDS, channel, value).length} />
      </div>

      <div className="mt-3 grid min-h-[640px] grid-cols-[minmax(300px,0.78fr)_minmax(520px,1.5fr)] gap-3">
        <Panel className="overflow-hidden" pad="p-0">
          <div className="border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground">상담 기록 {records.length}건</div>
          {records.length === 0 ? (
            <EmptyState icon={<MessageCircle className="h-6 w-6" />} title="조건에 맞는 상담 기록이 없습니다" hint="채널이나 갈래 필터를 바꿔 보세요" />
          ) : (
            <div className="divide-y divide-border/60">{records.map((record) => <RecordRow key={record.id} record={record} selected={selectedId === record.id} onSelect={() => setSelectedId(record.id)} />)}</div>
          )}
        </Panel>
        <div>{selected ? <RecordDetail key={selected.id} record={selected} /> : <Panel className="h-full"><EmptyState icon={<FileText className="h-6 w-6" />} title="상담 기록을 선택해 주세요" hint="왼쪽 목록에서 원문을 확인할 기록을 선택하세요" /></Panel>}</div>
      </div>
    </StaffPage>
  )
}
