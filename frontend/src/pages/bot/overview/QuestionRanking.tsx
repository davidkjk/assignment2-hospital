import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight } from '../../../components/icons'
import { btnGhost, btnLink } from '../../../components/staff-ui'
import type { BotStatsApi, DateRange, RankCluster, RankClusterDetail, RankingResult } from '../../../api/botStats'

// 상담봇 처리 현황(117)의 「많이 들어온 질문」 섹션 — QTOP-RANK-*. 116 별도 메뉴가 아니라 이 화면의 한 섹션이다.
// ⭐ 규칙이 데모 문구를 이긴다: 자동 묶음 한계 안내는 정본 문구(QTOP-RANK-04)를 쓴다.
// ⭐ 유효한 0건(empty)·계약 부재(no_contract)·오류를 각각 구분해 서로 위장하지 않는다(정본 §0·§4).

const CLUSTER_DISCLAIMER = '자동으로 비슷한 질문끼리 묶어본 결과이며 실제로 다른 질문이 섞여 있을 수 있습니다.'

type RankApi = Pick<BotStatsApi, 'getRanking' | 'getRankingCluster'>

export function QuestionRanking({
  api,
  range,
  onFaqBoost,
}: {
  api: RankApi
  range: DateRange
  onFaqBoost: (clusterId: string) => void
}) {
  const [result, setResult] = useState<RankingResult | null>(null) // null = 조회 중(이전 순위를 새 결과로 보이지 않음, QTOP-RANK-08)
  const [error, setError] = useState(false)
  const [detail, setDetail] = useState<{ id: string; data: RankClusterDetail } | null>(null)
  const [restored, setRestored] = useState(false) // 상세를 열었다 목록으로 돌아온 적이 있는가(QTOP-RANK-05 복원)

  useEffect(() => {
    let live = true
    setResult(null)
    setError(false)
    api
      .getRanking(range)
      .then((r) => live && setResult(r))
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [api, range])

  function openDetail(id: string) {
    api.getRankingCluster(id, range).then((data) => setDetail({ id, data }))
  }

  // ── 묶음 상세(별도 전체 화면) — 목록 복귀 시 재조회로 초기화하지 않는다(QTOP-RANK-05) ──
  if (detail) {
    return (
      <section data-testid="ranking-detail" className="rounded-xl border border-border/70 bg-card p-4 shadow-panel">
        <button className={btnLink} onClick={() => { setDetail(null); setRestored(true) }}>
          ← 목록으로
        </button>
        <h3 className="mt-2 text-sm font-semibold">{detail.data.representative}</h3>
        <p className="mb-3 mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          {CLUSTER_DISCLAIMER}
        </p>
        <ul className="space-y-1.5">
          {detail.data.questions.map((q, i) => (
            <li key={i} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
              {q}
            </li>
          ))}
        </ul>
        {/* 도착=안내자료 작성(KBADM=Task20)·승인 경유는 adminBotNav(NAV-ADM-08) — 저장만으로 답변에 반영하지 않는다 */}
        <button className={`${btnGhost} mt-3`} onClick={() => onFaqBoost(detail.id)}>
          이 질문을 안내자료로 만들기
        </button>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-panel">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">많이 들어온 질문</h3>
        <span className="text-[11px] text-muted-foreground">전체 질문 기준</span>
      </div>

      <RankingBody
        result={result}
        error={error}
        restored={restored}
        onRetry={() => { setResult(null); setError(false); api.getRanking(range).then(setResult).catch(() => setError(true)) }}
        onOpen={openDetail}
      />
    </section>
  )
}

function RankingBody({
  result,
  error,
  restored,
  onRetry,
  onOpen,
}: {
  result: RankingResult | null
  error: boolean
  restored: boolean
  onRetry: () => void
  onOpen: (id: string) => void
}) {
  if (error) {
    // 오류 — 같은 기간 재시도. 0건으로 위장하지 않는다(QTOP-RANK-09).
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">질문을 집계하지 못했습니다.</p>
        <button className={`${btnGhost} mt-2`} onClick={onRetry}>
          다시 시도
        </button>
      </div>
    )
  }
  if (result === null) {
    return (
      <p aria-label="질문 순위 로딩" className="py-6 text-center text-sm text-muted-foreground">
        불러오는 중…
      </p>
    )
  }
  if (result.kind === 'no_contract') {
    // 서버가 전체 질문 집계를 아예 제공하지 않음 — 임시 0·합성 순위 금지(QTOP-RANK-10)
    return <p className="py-6 text-center text-sm text-muted-foreground">현재 집계할 수 없음</p>
  }
  if (result.kind === 'empty') {
    return <p className="py-6 text-center text-sm text-muted-foreground">집계할 질문이 없습니다.</p>
  }

  const rows = [...result.clusters].sort((a, b) => b.count - a.count)
  const maxCount = Math.max(1, ...rows.map((r) => r.count))
  return (
    <>
      <p className="mb-2 mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
        {CLUSTER_DISCLAIMER}
      </p>
      {result.embeddingGap && (
        <p className="mb-2 text-[11px] text-amber-600">
          일부 질문은 묶음에 포함되지 않았을 수 있습니다.
        </p>
      )}
      <ol data-testid="ranking-list" data-restored={restored} className="space-y-2">
        {rows.map((c, i) => (
          <RankRow key={c.id} cluster={c} index={i} maxCount={maxCount} onOpen={onOpen} />
        ))}
      </ol>
    </>
  )
}

function RankRow({
  cluster,
  index,
  maxCount,
  onOpen,
}: {
  cluster: RankCluster
  index: number
  maxCount: number
  onOpen: (id: string) => void
}) {
  return (
    <li>
      <button
        data-testid="rank-row"
        onClick={() => onOpen(cluster.id)}
        className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-muted/50"
      >
        <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-primary">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{cluster.representative}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{cluster.count}건</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${(cluster.count / maxCount) * 100}%` }} />
          </div>
        </div>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}
