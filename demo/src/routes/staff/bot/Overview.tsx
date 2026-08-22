import { useState } from 'react'
import { AlertCircle, ArrowLeft, BarChart3, FileText, MessageCircle, Sparkles } from '@/components/icons'
import { PageHead, Panel, Segmented, StaffPage, StatTile, Tag, Toolbar, btnGhost, btnPrimary } from '../_ui'
import { channelSources, overviewMetrics, topQuestions } from './mockData'

// 상담봇 처리 현황 — BOTSTAT-DASH/QTOP-RANK. 최상위 testid: bot-overview.
type Period = '7일' | '30일' | '90일'
type TopQuestion = (typeof topQuestions)[number]

const periods: { key: Period; label: string }[] = [
  { key: '7일', label: '최근 7일' },
  { key: '30일', label: '최근 30일' },
  { key: '90일', label: '최근 90일' },
]

const detailExamples: Record<string, string[]> = {
  t1: ['주차 등록은 어느 창구에서 하나요?', '무료 주차 등록 장소를 알려 주세요.', '차량 번호는 어디에서 말하면 되나요?'],
  t2: ['예약 날짜를 내일로 바꿀 수 있나요?', '다음 주로 예약을 변경하고 싶어요.', '잡아 둔 진료 일정을 옮기려면 어떻게 하나요?'],
  t3: ['건강검진 전에 언제부터 금식해야 하나요?', '검진 날 물도 마시면 안 되나요?', '금식 시간을 알려 주세요.'],
}

function SimilarityNotice() {
  return <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />자동 유사도 묶음에는 실제로 다른 질문이 섞일 수 있으며, 확정 분류가 아닙니다.</div>
}

export function Overview() {
  const [period, setPeriod] = useState<Period>('30일')
  const [csvOpen, setCsvOpen] = useState(false)
  const [selectedTop, setSelectedTop] = useState<TopQuestion | null>(null)
  const [faqMessage, setFaqMessage] = useState('')

  if (selectedTop) {
    const examples = detailExamples[selectedTop.id] ?? [selectedTop.question]
    return (
      <StaffPage testid="bot-overview" max="max-w-5xl">
        <PageHead title="많이 들어온 질문 상세" sub={`${period} · ${selectedTop.count}건 묶음`} action={<button className={btnGhost} onClick={() => { setSelectedTop(null); setFaqMessage('') }}><ArrowLeft className="h-4 w-4" />현황으로</button>} />
        <SimilarityNotice />
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_19rem]">
          <Panel title={selectedTop.question}>
            <div className="divide-y divide-border/60">{examples.map((question, index) => <div key={question} className="flex gap-3 py-3 text-sm"><span className="text-xs font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>{question}</div>)}</div>
          </Panel>
          <Panel title="반복 질문 보강">
            <p className="text-xs leading-5 text-muted-foreground">이 묶음을 FAQ 안내자료 작성 화면으로 전달합니다. 관리자 승인 전에는 상담봇 답변에 반영되지 않습니다.</p>
            <button className={`${btnPrimary} mt-3 w-full justify-center`} onClick={() => setFaqMessage('새 안내자료에 대표 질문을 전달했습니다. 작성·확인 후 별도 승인이 필요합니다.')}><Sparkles className="h-4 w-4" />FAQ 보강</button>
            {faqMessage && <p className="mt-3 rounded-lg bg-primary/10 p-3 text-xs leading-5">{faqMessage}</p>}
          </Panel>
        </div>
      </StaffPage>
    )
  }

  return (
    <StaffPage testid="bot-overview">
      <PageHead title="상담봇 처리 현황" sub={`${period} 운영 지표와 전체 질문 순위를 함께 봅니다.`} />
      <Toolbar left={<Segmented options={periods} value={period} onChange={setPeriod} />} right={<button className={btnGhost} onClick={() => setCsvOpen((open) => !open)}><FileText className="h-4 w-4" />CSV 내보내기</button>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map((metric, index) => <StatTile key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} tone={index === 1 ? 'teal' : 'neutral'} />)}
      </div>

      {csvOpen && (
        <Panel className="mt-3" title={`CSV 미리보기 · ${period}`} action={<Tag>k=5 보호 적용</Tag>}>
          <div className="overflow-hidden rounded-lg border border-border text-xs">
            <div className="grid grid-cols-3 bg-muted px-3 py-2 font-semibold text-muted-foreground"><span>항목</span><span>건수</span><span>비고</span></div>
            <div className="grid grid-cols-3 border-t border-border px-3 py-2"><span>앱 · AI 해결</span><span>1,102</span><span>-</span></div>
            <div className="grid grid-cols-3 border-t border-border px-3 py-2"><span>직원 · 미해결</span><span>억제</span><span>5건 미만 및 보완 추론 셀</span></div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">화면의 집계 수치는 유지하고, CSV의 환자 기준 소수 셀과 추론 가능한 보완 셀만 가립니다. 환자 상세 명단은 포함하지 않습니다.</p>
        </Panel>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
        <Panel title="많이 들어온 질문 TOP 5" action={<span className="text-xs text-muted-foreground">전체 질문 · 건수순</span>} pad="p-0">
          <div className="px-4 pt-4"><SimilarityNotice /></div>
          <div className="divide-y divide-border/60 px-4 py-2">
            {topQuestions.map((question, index) => (
              <button key={question.id} onClick={() => setSelectedTop(question)} className="grid w-full grid-cols-[2rem_1fr_5rem] items-center gap-3 py-3 text-left text-sm hover:bg-muted">
                <span className="text-lg font-bold tabular-nums text-primary">{index + 1}</span>
                <span className="truncate font-medium">{question.question}</span>
                <span className="text-right font-semibold tabular-nums">{question.count}건</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="상담 유입원" action={<BarChart3 className="h-4 w-4 text-muted-foreground" />}>
          <div className="space-y-4">
            {channelSources.map((source) => (
              <div key={source.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm"><span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4 text-primary" />{source.label}</span><span className="font-semibold tabular-nums">{source.count.toLocaleString()}건 · {source.share}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${source.share}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">앱·웹·직원 경로를 서로 섞지 않고 분리해 집계합니다.</p>
        </Panel>
      </div>
    </StaffPage>
  )
}
