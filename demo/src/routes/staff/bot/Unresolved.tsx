import { useState } from 'react'
import { AlertTriangle, ChevronRight, X, Sparkles } from '@/components/icons'
import { StaffPage, PageHead, btnPrimary } from '../_ui'
import { unresolvedClusters, type UnresolvedCluster } from './mockData'

// 미해결 질문 모아보기 (/staff/bot/unresolved) — UNRES-CLUSTER-*.
// 답 못 한 질문을 유사도로 묶어 대표 질문+N건, 건수 내림차순. 자동 묶음 한계 안내 항상.
// 클러스터 열면 예시 질문 + [안내자료로 답 만들기]. data-testid="bot-unresolved".

export function Unresolved() {
  const [open, setOpen] = useState<UnresolvedCluster | null>(null)
  const clusters = [...unresolvedClusters].sort((a, b) => b.count - a.count)

  return (
    <StaffPage max="max-w-4xl" testid="bot-unresolved">
      <PageHead
        title="미해결 질문"
        sub="상담봇이 답하지 못한 질문입니다 · 최근 7일"
        action={<span className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm tabular-nums text-muted-foreground">8/16 – 8/22</span>}
      />

      <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        비슷한 질문끼리 자동으로 묶어본 결과이며, 실제로 다른 질문이 섞여 있을 수 있습니다.
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        {clusters.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpen(c)}
            className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted"
          >
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800">{c.count}건</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.question}</div>
              <div className="text-[11px] text-muted-foreground">마지막 {c.lastAt} · 예시 {c.examples.length}건</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      {open && <ClusterDetail cluster={open} onClose={() => setOpen(null)} />}
    </StaffPage>
  )
}

function ClusterDetail({ cluster, onClose }: { cluster: UnresolvedCluster; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold">{cluster.question}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">이 묶음에 들어온 질문 {cluster.count}건 · 예시 {cluster.examples.length}건</p>
        <ul className="mb-4 space-y-1.5">
          {cluster.examples.map((q, i) => (
            <li key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{q}</li>
          ))}
        </ul>
        <button className={`${btnPrimary} w-full justify-center`}>
          <Sparkles className="h-4 w-4" /> 안내자료로 답 만들기
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">안내자료를 작성해도 승인 전에는 상담봇 답변에 반영되지 않습니다.</p>
      </div>
    </div>
  )
}
