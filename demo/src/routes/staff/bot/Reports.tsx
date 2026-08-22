import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, FileText, FlagIcon, XCircle } from '@/components/icons'
import { PageHead, Panel, Segmented, StaffPage, StatusBadge, Tag, btnGhost, btnPrimary } from '../_ui'
import { wrongAnswerReports, type ReportStatus, type WrongAnswerReport } from './mockData'

// 오답 신고 처리함 — BADINBOX-REVIEW. 최상위 testid: bot-reports.
type Filter = '전체' | ReportStatus
type Decision = '반영' | '반려' | null

const filters: { key: Filter; label: string }[] = [
  { key: '전체', label: '전체' },
  { key: '처리 전', label: '처리 전' },
  { key: '처리 완료', label: '처리 완료' },
]

const sourceLabel = { realtime_report: '실시간 신고', quality_review: '품질 리뷰' } as const

export function Reports() {
  const [filter, setFilter] = useState<Filter>('처리 전')
  const [selected, setSelected] = useState<WrongAnswerReport | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ReportStatus>>(() => Object.fromEntries(wrongAnswerReports.map((report) => [report.id, report.status])))
  const [useAsExample, setUseAsExample] = useState(false)
  const [decision, setDecision] = useState<Decision>(null)
  const [message, setMessage] = useState('')

  const visible = useMemo(
    () => wrongAnswerReports.filter((report) => filter === '전체' || statuses[report.id] === filter),
    [filter, statuses],
  )

  const complete = (kind: Exclude<Decision, null>) => {
    if (!selected) return
    setStatuses((current) => ({ ...current, [selected.id]: '처리 완료' }))
    setDecision(null)
    setMessage(kind === '반영'
      ? `안내자료 수정 흐름으로 전달했습니다.${useAsExample ? ' 승인된 교정을 참고 예시로도 등록합니다.' : ''} 관리자 승인 전에는 상담봇에 반영되지 않습니다.`
      : '신고를 반려했습니다. 승인 자료와 참고 예시는 변경되지 않았습니다.')
  }

  if (selected) {
    const status = statuses[selected.id]
    return (
      <StaffPage testid="bot-reports" max="max-w-5xl">
        <PageHead title="오답 신고 검토" sub={`${sourceLabel[selected.source]} · ${selected.reportedAt}`} action={<button className={btnGhost} onClick={() => { setSelected(null); setMessage(''); setUseAsExample(false) }}><ArrowLeft className="h-4 w-4" />처리함으로</button>} />
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="font-medium text-foreground">승인 전 미반영</strong> · 신고를 반영해도 안내자료 수정과 관리자 승인을 거친 뒤 상담봇에 반영됩니다.</span></div>
        <div className="grid gap-3 lg:grid-cols-[1fr_19rem]">
          <div className="space-y-3">
            <Panel title="대상 질문" action={<div className="flex gap-1.5"><Tag>{sourceLabel[selected.source]}</Tag><StatusBadge status={status} /></div>}><p className="text-sm font-medium">{selected.question}</p></Panel>
            <Panel title="상담봇 답변"><p className="text-sm leading-6">{selected.answer}</p><div className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">답변 근거 · {selected.evidence}</div></Panel>
            <Panel title="올바른 안내"><textarea defaultValue={selected.correction} rows={5} className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" /></Panel>
          </div>
          <div className="space-y-3">
            <Panel title="처리">
              <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={useAsExample} onChange={(event) => setUseAsExample(event.target.checked)} className="mt-0.5" /><span><span className="font-medium text-foreground">향후 유사 질문 예시로도 사용</span><br />관리자 확인이 끝난 교정만 등록합니다.</span></label>
              <div className="mt-4 space-y-2">
                <button className={`${btnPrimary} w-full justify-center`} disabled={status === '처리 완료'} onClick={() => setDecision('반영')}><Check className="h-4 w-4" />반영</button>
                <button className={`${btnGhost} w-full justify-center`} disabled={status === '처리 완료'} onClick={() => setDecision('반려')}><XCircle className="h-4 w-4" />반려</button>
              </div>
            </Panel>
            {message && <Panel title="처리 결과"><p className="text-xs leading-5 text-muted-foreground">{message}</p></Panel>}
          </div>
        </div>
        {decision && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
            <Panel className="w-full max-w-md" title={`${decision} 처리할까요?`}>
              <p className="text-sm text-muted-foreground">{decision === '반영' ? '안내자료 수정 흐름으로 전달하며, 별도 승인 전에는 공개되지 않습니다.' : '반려하면 이 신고의 처리가 완료되며 승인 자료는 바뀌지 않습니다.'}</p>
              <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setDecision(null)}>취소</button><button className={btnPrimary} onClick={() => complete(decision)}>확인</button></div>
            </Panel>
          </div>
        )}
      </StaffPage>
    )
  }

  return (
    <StaffPage testid="bot-reports">
      <PageHead title="오답 신고 처리함" sub="실시간 신고와 품질 리뷰 교정을 한곳에서 검토합니다." />
      <div className="mb-3"><Segmented options={filters} value={filter} onChange={setFilter} count={(key) => key === '전체' ? wrongAnswerReports.length : wrongAnswerReports.filter((report) => statuses[report.id] === key).length} /></div>
      <Panel pad="p-0">
        <div className="grid grid-cols-[8rem_1fr_10rem_7rem] gap-3 border-b border-border/70 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground"><span>신고 출처</span><span>대상 답변</span><span>신고 시각</span><span>상태</span></div>
        <div className="divide-y divide-border/60">
          {visible.map((report) => (
            <button key={report.id} onClick={() => setSelected(report)} className="grid w-full grid-cols-[8rem_1fr_10rem_7rem] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted">
              <span className="flex items-center gap-1.5"><FlagIcon className="h-4 w-4 text-primary" /><Tag>{sourceLabel[report.source]}</Tag></span>
              <span className="min-w-0"><span className="block truncate font-medium">{report.question}</span><span className="block truncate text-xs text-muted-foreground">{report.answer}</span></span>
              <span className="text-xs text-muted-foreground">{report.reportedAt}</span>
              <StatusBadge status={statuses[report.id]} />
            </button>
          ))}
        </div>
      </Panel>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-4 w-4" />반영 항목은 안내자료 수정·승인을 별도로 거칩니다.</div>
    </StaffPage>
  )
}
