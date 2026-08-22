import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, FlagIcon, MessageCircle, XCircle } from '@/components/icons'
import { PageHead, Panel, Segmented, StaffPage, StatTile, StatusBadge, Tag, Toolbar, btnGhost, btnLink, btnPrimary } from '../_ui'
import { qualityConversations, qualityMetrics, referenceExamples, type QualityConversation } from './mockData'

// 상담 품질 리포트 + 참고 예시 관리 — QUALITY-REPORT/QAEX-LIST. 최상위 testid: bot-quality.
type Period = '7일' | '30일' | '90일'

const periods: { key: Period; label: string }[] = [
  { key: '7일', label: '최근 7일' },
  { key: '30일', label: '최근 30일' },
  { key: '90일', label: '최근 90일' },
]

export function Quality() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('30일')
  const [reportedOnly, setReportedOnly] = useState(false)
  const [selected, setSelected] = useState<QualityConversation>(qualityConversations[0])
  const [correction, setCorrection] = useState('')
  const [saved, setSaved] = useState(false)
  const [activeExamples, setActiveExamples] = useState<Record<string, boolean>>(() => Object.fromEntries(referenceExamples.map((example) => [example.id, example.active])))
  const [disableTarget, setDisableTarget] = useState<string | null>(null)

  const conversations = useMemo(
    () => qualityConversations.filter((conversation) => !reportedOnly || conversation.reported),
    [reportedOnly],
  )

  const selectConversation = (conversation: QualityConversation) => {
    setSelected(conversation)
    setCorrection('')
    setSaved(false)
  }

  return (
    <StaffPage testid="bot-quality" max="max-w-7xl">
      <PageHead title="상담 품질 리포트" sub={`${period} 상담을 검토하고 교정 내용을 오답 처리함으로 보냅니다.`} />
      <Toolbar left={<Segmented options={periods} value={period} onChange={setPeriod} />} right={<label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={reportedOnly} onChange={(event) => setReportedOnly(event.target.checked)} />오답 신고만 보기</label>} />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {qualityMetrics.map((metric, index) => <StatTile key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} tone={index === 0 ? 'teal' : 'neutral'} />)}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(22rem,0.9fr)_minmax(25rem,1.1fr)]">
        <Panel title="상담 목록" action={<span className="text-xs text-muted-foreground">미검토 우선 · 최신순</span>} pad="p-0">
          <div className="divide-y divide-border/60">
            {conversations.map((conversation) => (
              <button key={conversation.id} onClick={() => selectConversation(conversation)} className={`w-full px-4 py-3 text-left text-sm hover:bg-muted ${selected.id === conversation.id ? 'bg-primary/10' : ''}`}>
                <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{conversation.question}</span><StatusBadge status={conversation.reviewStatus === '미검토' ? '처리 전' : '처리 완료'} /></div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{conversation.at}</span><Tag>{conversation.channel}</Tag><Tag>{conversation.grounded ? '병원 안내 사용' : '근거 없음'}</Tag>{conversation.reported && <Tag><FlagIcon className="mr-1 inline h-3 w-3" />오답 신고</Tag>}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="대화 상세" action={<Tag>{selected.channel}</Tag>}>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted p-3"><div className="mb-1 text-xs font-semibold text-muted-foreground">질문</div>{selected.question}</div>
            <div className="rounded-lg border border-border p-3"><div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MessageCircle className="h-3.5 w-3.5" />상담봇 답변</div>{selected.answer}</div>
            <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>답변에 사용한 병원 안내 · <strong className="font-medium text-foreground">{selected.evidence}</strong></span></div>
            <label className="block text-xs font-medium text-muted-foreground">올바른 안내<textarea value={correction} onChange={(event) => { setCorrection(event.target.value); setSaved(false) }} rows={4} placeholder="정확한 안내를 입력해 주세요" className="mt-1 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" /></label>
            <div className="flex justify-end"><button className={btnPrimary} disabled={!correction.trim()} onClick={() => setSaved(true)}><CheckCircle2 className="h-4 w-4" />교정 저장</button></div>
            {saved && (
              <div className="rounded-lg border border-border bg-primary/10 p-3 text-xs leading-5"><strong className="font-medium">교정을 저장했습니다.</strong> 오답 신고 처리함에서 반영/반려 검토를 거쳐야 상담봇에 반영됩니다.<button className={`${btnLink} ml-1`} onClick={() => navigate('/staff/bot/reports')}>처리함으로 가기 ›</button></div>
            )}
          </div>
        </Panel>
      </div>

      <Panel className="mt-3" title="참고 예시 관리" action={<span className="text-xs text-muted-foreground">승인된 교정만 유사 질문 답변에 참고</span>}>
        <div className="divide-y divide-border/60">
          {referenceExamples.map((example) => {
            const active = activeExamples[example.id]
            return (
              <div key={example.id} className="grid gap-3 py-3 md:grid-cols-[1fr_1fr_7rem] md:items-start">
                <div><div className="text-xs font-semibold text-muted-foreground">원 질문</div><p className="mt-1 text-sm">{example.question}</p></div>
                <div><div className="text-xs font-semibold text-muted-foreground">교정 답변</div><p className="mt-1 text-sm">{example.correction}</p></div>
                <div className="flex flex-col items-end gap-1.5"><StatusBadge status={active ? '활성' : '비공개'} />{active && <button className={btnLink} onClick={() => setDisableTarget(example.id)}>비활성화</button>}</div>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />참고 예시는 삭제하지 않고 비활성 상태로 바꿉니다. 재활성화 방식은 아직 확인이 필요합니다.</div>

      {disableTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <Panel className="w-full max-w-md" title="참고 예시를 비활성화할까요?">
            <p className="text-sm text-muted-foreground">이 예시는 더 이상 상담봇이 참고하지 않습니다. 삭제되지는 않지만 재활성화 방식은 아직 정해지지 않았습니다.</p>
            <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setDisableTarget(null)}>취소</button><button className={btnPrimary} onClick={() => { setActiveExamples((current) => ({ ...current, [disableTarget]: false })); setDisableTarget(null) }}><XCircle className="h-4 w-4" />비활성화</button></div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
