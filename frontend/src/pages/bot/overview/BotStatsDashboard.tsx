import { useEffect, useState } from 'react'
import { PeriodSelect, PERIOD_CUSTOM, PERIOD_PRESETS, periodRange, btnGhost, type PeriodValue } from '../../../components/staff-ui'
import { QuestionRanking } from './QuestionRanking'
import type { BotMetrics, BotStatsApi, DateRange, DrillRow, InflowShare, MetricValue } from '../../../api/botStats'

// 상담봇 처리 현황(117 통합) — BOTSTAT-DASH-*. 직원웹 STAT-* 부품 계열을 재사용해 상담봇 지표를 얹는다.
// ⭐ 유효한 0건 ↔ 계약 부재(no_contract) ↔ 오류 ↔ 오프라인을 각각 구분한다 — 어느 것도 서로 위장하지 않는다(정본 §0·§4).
// ⭐ CSV k=5 억제는 CSV에만(화면 수치는 억제 없음, BOTSTAT-DASH-13)·감사 payload엔 개인정보·검색어 금지(BOTSTAT-DASH-15).

type DashApi = Pick<BotStatsApi, 'getMetrics' | 'getDrill' | 'exportCsv' | 'getRanking' | 'getRankingCluster'>
type LoadError = null | 'error' | 'offline'
type AuditPayload = { action: string; metric?: string; from: string; to: string; suppressed?: boolean }

const BOT_METRIC_LABELS: Record<'inquiries' | 'selfServed' | 'handedOff', string> = {
  inquiries: '문의 수',
  selfServed: '자체 안내',
  handedOff: '직원 연결',
}

export function BotStatsDashboard({
  api,
  range,
  onAudit,
  onFaqBoost = () => {},
}: {
  api: DashApi
  range: DateRange
  onAudit: (payload: AuditPayload) => void
  onFaqBoost?: (clusterId: string) => void
}) {
  // 117 화면이 기간을 소유한다(controlled). 초기값은 부모가 준 range — 그 범위가 프리셋과 맞으면 그 이름으로, 아니면 '직접 입력'으로 연다.
  const [period, setPeriod] = useState<PeriodValue>(() => inferPeriod(range))
  const activeRange: DateRange = { from: period.from, to: period.to }

  const [metrics, setMetrics] = useState<BotMetrics | { kind: 'no_contract' } | null>(null) // null = 조회 중
  const [errState, setErrState] = useState<LoadError>(null)
  const [drill, setDrill] = useState<{ metric: string; rows: DrillRow[] } | null>(null)
  const [csvNotice, setCsvNotice] = useState(false)

  useEffect(() => {
    let live = true
    setMetrics(null)
    setErrState(null)
    setDrill(null)
    setCsvNotice(false)
    api
      .getMetrics(activeRange)
      .then((m) => live && setMetrics(m))
      .catch((e: unknown) => live && setErrState(isOffline(e) ? 'offline' : 'error'))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, period.from, period.to])

  function openDrill(metric: string) {
    // 상세 열기 전에 감사 — 지표·기간만, 마스킹 명단은 payload에 담지 않는다(BOTSTAT-DASH-15).
    onAudit({ action: 'stats_drilldown', metric, from: activeRange.from, to: activeRange.to })
    api.getDrill(metric, activeRange).then((rows) => setDrill({ metric, rows }))
  }

  function exportCsv() {
    setCsvNotice(true) // 소수 인원 보호 억제 안내(다운로드 직전)
    onAudit({ action: 'stats_export', from: activeRange.from, to: activeRange.to, suppressed: true })
    api.exportCsv(activeRange).then((blob) => triggerDownload(blob, activeRange))
  }

  const loading = metrics === null && errState === null
  const noContract = metrics !== null && 'kind' in metrics && metrics.kind === 'no_contract'
  const loaded = metrics !== null && !('kind' in metrics) ? (metrics as BotMetrics) : null

  return (
    <div className="mx-auto max-w-5xl">
      {/* 기간 선택 — 화면이 소유(controlled). 데모의 7일 고정 대신 기간 선택(범주4 확정). */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">조회 기간 · {activeRange.from} ~ {activeRange.to}</p>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>

      {/* 운영 지표 — 상단 전체폭(데모 배치). 지표 라벨은 규칙(DASH-03): 문의 수·자체 안내·직원 연결. */}
      <section className="mb-5">
        <h3 className="mb-3 text-sm font-semibold">운영 지표</h3>
        {errState === 'offline' ? (
          <StateBox text="오프라인이라 최신 집계를 불러올 수 없습니다." onRetry={() => setPeriod({ ...period })} />
        ) : errState === 'error' ? (
          <StateBox text="현황을 불러오지 못했습니다." onRetry={() => setPeriod({ ...period })} />
        ) : loading ? (
          <p aria-label="현황 로딩" className="rounded-xl border border-border/70 bg-card py-8 text-center text-sm text-muted-foreground">
            불러오는 중…
          </p>
        ) : noContract ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">현재 집계할 수 없음</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">이 화면의 집계 연결이 아직 없어 0으로 채우지 않습니다.</p>
          </div>
        ) : (
          loaded && (
            <>
              <div data-testid="bot-metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(['inquiries', 'selfServed', 'handedOff'] as const).map((key) => (
                  <MetricCard
                    key={key}
                    metricKey={key}
                    label={BOT_METRIC_LABELS[key]}
                    metric={loaded[key]}
                    onDrill={() => openDrill(key)}
                  />
                ))}
              </div>
              {drill && <DrillPanel drill={drill} label={BOT_METRIC_LABELS[drill.metric as 'inquiries']} onClose={() => setDrill(null)} />}
            </>
          )
        )}
      </section>

      {/* 2열(데모 배치): 좌 많이 들어온 질문(116 흡수) / 우 유입원 + CSV */}
      <div className="grid gap-4 lg:grid-cols-2">
        <QuestionRanking api={api} range={activeRange} onFaqBoost={onFaqBoost} />
        {loaded && (
          <div className="space-y-4">
            <Inflow inflow={loaded.inflow} />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-4 py-3">
              <span className="text-xs text-muted-foreground">CSV에는 환자 기준 5건 미만 셀을 가립니다.</span>
              <button className={btnGhost} onClick={exportCsv}>
                CSV 내보내기
              </button>
            </div>
            {csvNotice && (
              <p className="text-[11px] text-amber-600">소수 인원 보호로 일부 셀이 비공개될 수 있습니다.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Inflow({ inflow }: { inflow: InflowShare }) {
  if (inflow.kind === 'no_contract') {
    return (
      <section data-testid="inflow" className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <h4 className="text-sm font-semibold text-muted-foreground">예약 유입원</h4>
        <p className="mt-1 text-sm text-muted-foreground">현재 집계할 수 없음</p>
      </section>
    )
  }
  // 서버는 유입원을 건수(app/staff/chatbot 원값)로 준다 → 표시(STAT-METRIC-05: `app%:staff%:chatbot%`)는
  // 총합으로 나눠 비율로 환산한다(총합 0이면 0%). 원값을 그대로 %로 찍으면 100%를 넘는다.
  const total = inflow.app + inflow.staff + inflow.chatbot
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const rows: Array<{ label: string; share: number }> = [
    { label: '앱', share: pct(inflow.app) },
    { label: '직원', share: pct(inflow.staff) },
    { label: '챗봇', share: pct(inflow.chatbot) },
  ]
  return (
    <section data-testid="inflow" className="rounded-xl border border-border/70 bg-card p-4 shadow-panel">
      <h4 className="mb-3 text-sm font-semibold">예약 유입원</h4>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>
                {r.label} {r.share}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-sky-500/70" style={{ width: `${r.share}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MetricCard({
  metricKey,
  label,
  metric,
  onDrill,
}: {
  metricKey: string
  label: string
  metric: MetricValue
  onDrill: () => void
}) {
  const base = 'rounded-xl border border-border/70 bg-card p-4 shadow-panel text-left'
  if (metric.kind === 'no_contract') {
    return (
      <div data-testid={`metric-${metricKey}`} className={`${base} border-dashed`}>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 text-sm text-muted-foreground">현재 집계할 수 없음</div>
      </div>
    )
  }
  const body = (
    <>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-primary">{metric.count}건</div>
    </>
  )
  if (!metric.drillable) {
    // 상세 계약 없는 지표 — 클릭 가능처럼 가장하지 않는다(BOTSTAT-DASH-10)
    return (
      <div data-testid={`metric-${metricKey}`} aria-disabled="true" className={base}>
        {body}
      </div>
    )
  }
  return (
    <button data-testid={`metric-${metricKey}`} onClick={onDrill} className={`${base} w-full hover:bg-muted/40`}>
      {body}
    </button>
  )
}

function DrillPanel({ drill, label, onClose }: { drill: { rows: DrillRow[] }; label: string; onClose: () => void }) {
  return (
    <section className="mt-3 rounded-xl border border-border/70 bg-card p-4 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label} 상세</h4>
        <button className="text-xs text-primary hover:underline" onClick={onClose}>
          닫기
        </button>
      </div>
      <ul className="space-y-1">
        {drill.rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
            <span>{r.patientMasked}</span>
            <span className="tabular-nums text-muted-foreground">{r.at}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function StateBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <button className={`${btnGhost} mt-2`} onClick={onRetry}>
        다시 시도
      </button>
    </div>
  )
}

/** 부모가 준 {from,to}가 프리셋 범위와 일치하면 그 프리셋 이름으로, 아니면 '직접 입력'으로 연다. */
function inferPeriod(range: DateRange): PeriodValue {
  for (const preset of PERIOD_PRESETS) {
    const r = periodRange(preset)
    if (r.from === range.from && r.to === range.to) return { preset, from: range.from, to: range.to }
  }
  return { preset: PERIOD_CUSTOM, from: range.from, to: range.to }
}

function isOffline(e: unknown): boolean {
  return !!(e && typeof e === 'object' && ((e as { offline?: boolean }).offline || (e as { status?: number }).status === 0))
}

function triggerDownload(blob: Blob, range: DateRange) {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `상담봇-통계_${range.from}_${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    /* 브라우저가 막으면 조용히 넘어간다 — 화면 상태는 그대로다. */
  }
}
