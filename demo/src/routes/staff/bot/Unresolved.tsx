import { useState } from 'react'
import { AlertCircle, ArrowLeft, FileText, Layers3, SealQuestionIcon } from '@/components/icons'
import { PageHead, Panel, Segmented, StaffPage, Tag, btnGhost, btnPrimary } from '../_ui'
import { unresolvedClusters, type UnresolvedCluster } from './mockData'

// 미해결 질문 모아보기 — UNRES-CLUSTER. 최상위 testid: bot-unresolved.
type Period = '7일' | '30일' | '90일'

const periodOptions: { key: Period; label: string }[] = [
  { key: '7일', label: '최근 7일' },
  { key: '30일', label: '최근 30일' },
  { key: '90일', label: '최근 90일' },
]

function LimitNotice() {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span><strong className="font-medium text-foreground">자동 묶음 안내</strong> · 비슷한 질문끼리 자동으로 묶어본 결과이며 실제로 다른 질문이 섞여 있을 수 있습니다.</span>
    </div>
  )
}

export function Unresolved() {
  const [period, setPeriod] = useState<Period>('30일')
  const [selected, setSelected] = useState<UnresolvedCluster | null>(null)
  const [composing, setComposing] = useState(false)

  if (selected) {
    return (
      <StaffPage testid="bot-unresolved" max="max-w-5xl">
        <PageHead
          title="미해결 질문 묶음"
          sub={`${period} · 대표 질문에 포함된 원문 예시`}
          action={<button className={btnGhost} onClick={() => { setSelected(null); setComposing(false) }}><ArrowLeft className="h-4 w-4" />목록으로</button>}
        />
        <LimitNotice />
        <div className="grid gap-3 lg:grid-cols-[1fr_19rem]">
          <Panel title={selected.question} action={<Tag>{selected.count}건</Tag>}>
            <div className="divide-y divide-border/60">
              {selected.examples.map((question, index) => (
                <div key={question} className="flex gap-3 py-3 text-sm"><span className="text-xs font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span><p>{question}</p></div>
              ))}
            </div>
          </Panel>
          <div className="space-y-3">
            <Panel title="안내자료 보강">
              <p className="text-xs leading-5 text-muted-foreground">대표 질문과 예시를 바탕으로 새 안내자료를 작성합니다. 승인 성공 뒤에만 상담봇 답변에 반영됩니다.</p>
              <button className={`${btnPrimary} mt-3 w-full justify-center`} onClick={() => setComposing(true)}><FileText className="h-4 w-4" />안내자료로 답 만들기</button>
            </Panel>
            {composing && (
              <Panel title="작성 화면으로 전달할 내용">
                <label className="block text-xs font-medium text-muted-foreground">제목<input defaultValue={selected.question} className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" /></label>
                <p className="mt-3 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">새 안내자료 편집기에 질문 묶음을 전달했습니다. 작성 후 별도 승인 절차가 필요합니다.</p>
              </Panel>
            )}
          </div>
        </div>
      </StaffPage>
    )
  }

  return (
    <StaffPage testid="bot-unresolved">
      <PageHead title="미해결 질문" sub="상담봇이 답하지 못한 반복 질문을 건수순으로 확인합니다." />
      <div className="mb-3"><Segmented options={periodOptions} value={period} onChange={setPeriod} /></div>
      <LimitNotice />
      <Panel pad="p-0">
        <div className="grid grid-cols-[1fr_6rem_8rem_2rem] gap-3 border-b border-border/70 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground"><span>대표 질문</span><span>질문 수</span><span>최근 발생</span><span /></div>
        <div className="divide-y divide-border/60">
          {unresolvedClusters.map((cluster) => (
            <button key={cluster.id} onClick={() => setSelected(cluster)} className="grid w-full grid-cols-[1fr_6rem_8rem_2rem] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted">
              <span className="flex min-w-0 items-center gap-2 font-medium"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><SealQuestionIcon className="h-4 w-4" /></span><span className="truncate">{cluster.question}</span></span>
              <span className="font-semibold tabular-nums">{cluster.count}건</span>
              <span className="text-xs text-muted-foreground">{cluster.lastAt}</span>
              <Layers3 className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </Panel>
    </StaffPage>
  )
}
