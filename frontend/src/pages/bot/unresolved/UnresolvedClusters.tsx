import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Sparkles } from '../../../components/icons'
import { EmptyState, btnGhost, btnPrimary } from '../../../components/staff-ui'
import type { Cluster, ClusterDetail, DateRange, QualityApi } from '../../../api/qualityAdmin'
import { formatKst } from '../knowledge/format'

// 미해결 질문 모아보기(UNRES-CLUSTER-*) — 봇이 답 못 한 질문을 유사도로 묶어 「대표 질문 + N건」 내림차순.
// ⭐ 자동 묶음은 확정 분류가 아니다 — 한계 안내를 항상 함께 보인다(04). 임베딩 누락이 있으면 전체 집계라 단정하지 않는다(11).
// ⭐ 0건(07)·집계 실패(09)·집계 계약 부재(10)를 서로 뒤바꾸지 않는다. 자료 보강은 안내자료 작성으로 — 승인 전 미반영(06).
// 시각 뼈대 = 데모 bot/Unresolved.tsx(앰버 안내 + 건수 배지 목록 + 상세). 상세는 규칙대로 별도 전체 화면(05).

type Phase = 'loading' | 'ready' | 'empty' | 'error' | 'no_contract'

export interface OpenDetailTarget {
  clusterId: string
  restore: { range: DateRange }
}
export interface AddKbTarget {
  from: 'unresolved'
  clusterId: string
  representative: string
  questions: string[]
}

export interface UnresolvedClustersProps {
  api: QualityApi
  range: DateRange
  /** 묶음 상세를 별도 전체 화면으로(05). 없으면 이 컴포넌트 안에서 전체 폭으로 연다. */
  onOpenDetail?: (t: OpenDetailTarget) => void
  /** 상세로 열린 묶음(페이지가 관리). */
  detailClusterId?: string | null
  onBackFromDetail?: () => void
  /** 상세의 [안내자료로 보강] — 안내자료 작성으로 이동(승인 전 미반영, 06). */
  onAddKb?: (t: AddKbTarget) => void
}

export function UnresolvedClusters({ api, range, onOpenDetail, detailClusterId, onBackFromDetail, onAddKb }: UnresolvedClustersProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [embeddingGap, setEmbeddingGap] = useState(false)
  const [innerDetail, setInnerDetail] = useState<string | null>(null)
  const detailId = detailClusterId ?? innerDetail

  const load = () => {
    setPhase('loading') // 기간은 유지, 임시 0건·이전 결과는 보이지 않는다(08)
    api
      .listUnresolved(range)
      .then((r) => {
        if (r.kind === 'no_contract') {
          setPhase('no_contract') // 0건·빈 차트로 만들지 않는다(10)
          return
        }
        const sorted = [...r.clusters].sort((a, b) => b.count - a.count)
        setClusters(sorted)
        setEmbeddingGap(r.embeddingGap)
        setPhase(sorted.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => setPhase('error'))
  }

  useEffect(load, [api, range.from, range.to])

  const openDetail = (c: Cluster) => {
    if (onOpenDetail) onOpenDetail({ clusterId: c.id, restore: { range } })
    else setInnerDetail(c.id)
  }
  const back = () => (onBackFromDetail ? onBackFromDetail() : setInnerDetail(null))

  return (
    <div data-testid="unresolved-scope" data-scope="unresolved_only" className="space-y-3">
      {/* 자동 묶음 한계 안내 — 어떤 상태에서도 항상(04) */}
      <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        비슷한 질문끼리 자동으로 묶어본 결과이며, 실제로 다른 질문이 섞여 있을 수 있습니다.
      </div>

      {detailId ? (
        <ClusterDetailView api={api} clusterId={detailId} range={range} onBack={back} onAddKb={onAddKb} />
      ) : (
        <>
          {embeddingGap && phase === 'ready' && (
            <p className="text-xs text-amber-800">일부 질문이 집계에서 빠졌을 수 있습니다(임베딩이 없는 질문이 있음 — 확인 필요). 전체를 집계한 것으로 보지 마세요.</p>
          )}

          {phase === 'loading' && (
            <div aria-label="집계 로딩" className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-10 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> {range.from || '전체'} ~ {range.to} 집계 중…
            </div>
          )}
          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-10 text-center">
              <p className="text-sm font-medium">미해결 질문을 집계하지 못했습니다</p>
              <button className={btnGhost} onClick={load}>다시 시도</button>
            </div>
          )}
          {phase === 'no_contract' && (
            <div className="rounded-xl border border-border/70 bg-card px-4 py-10 text-center">
              <p className="text-sm font-medium">현재 집계할 수 없음</p>
              <p className="mt-1 text-xs text-muted-foreground">서버가 유사 질문 묶음 집계를 아직 제공하지 않습니다.</p>
            </div>
          )}
          {phase === 'empty' && (
            <div className="rounded-xl border border-border/70 bg-card">
              <EmptyState title="미해결 질문이 없습니다" hint="새 질문이 쌓이면 여기에 다시 묶여 나타납니다." />
            </div>
          )}
          {phase === 'ready' && (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
              {clusters.map((c) => (
                <button
                  key={c.id}
                  data-testid="cluster-row"
                  data-count={c.count}
                  onClick={() => openDetail(c)}
                  className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted"
                >
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800">{c.count}건</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.representative}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {c.lastAt ? `마지막 ${formatKst(c.lastAt)} · ` : ''}질문 {c.count}건
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ClusterDetailView({
  api, clusterId, range, onBack, onAddKb,
}: {
  api: QualityApi
  clusterId: string
  range: DateRange
  onBack: () => void
  onAddKb?: (t: AddKbTarget) => void
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detail, setDetail] = useState<ClusterDetail | null>(null)

  const load = () => {
    setPhase('loading')
    api
      .getUnresolvedCluster(clusterId, range)
      .then((d) => {
        setDetail(d)
        setPhase('ready')
      })
      .catch(() => setPhase('error'))
  }
  useEffect(load, [api, clusterId, range.from, range.to])

  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">{detail?.representative ?? '묶음 상세'}</h3>
        <button className={`${btnGhost} px-2.5 py-1`} onClick={onBack}>목록으로</button>
      </div>
      {phase === 'loading' && <p className="text-sm text-muted-foreground">묶음을 불러오는 중…</p>}
      {phase === 'error' && (
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">묶음을 불러오지 못했습니다</p>
          <button className={btnGhost} onClick={load}>다시 시도</button>
        </div>
      )}
      {phase === 'ready' && detail && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">이 묶음에 들어온 질문 {detail.questions.length}건 — 표시 항목·정렬은 계약 확정 전(확인 필요)</p>
          <ul className="mb-4 space-y-1.5">
            {detail.questions.map((q, i) => (
              <li key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{q}</li>
            ))}
          </ul>
          <button
            className={`${btnPrimary} w-full justify-center`}
            onClick={() => onAddKb?.({ from: 'unresolved', clusterId, representative: detail.representative, questions: detail.questions })}
          >
            <Sparkles className="h-4 w-4" /> 안내자료로 보강
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">안내자료 작성으로 이동합니다. 안내자료는 승인 전에는 답변에 반영되지 않습니다.</p>
        </>
      )}
    </div>
  )
}
