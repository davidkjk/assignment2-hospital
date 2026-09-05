import { AlertTriangle, ChevronRight } from '@/components/icons'
import { StaffPage, PageHead, StatTile, PeriodSelect } from '../_ui'
import { overviewMetrics, topQuestions, channelSources } from './mockData'

// 상담봇 처리 현황 (/staff/bot/overview) — BOTSTAT-DASH-* · QTOP-RANK-*.
// 운영 지표 타일 + 예약 유입원 3분류 + 많이 들어온 질문 순위(자동 묶음 한계 안내).
// 계약 부재 지표는 '현재 집계할 수 없음'(placeholder 0 금지, BOTSTAT-DASH-05).
// data-testid="bot-overview".

const TONE = ['teal', 'green', 'sky', 'amber'] as const

export function Overview() {
  const maxTop = Math.max(...topQuestions.map((q) => q.count))

  return (
    <StaffPage max="max-w-5xl" testid="bot-overview">
      <PageHead title="상담봇 처리 현황" action={<PeriodSelect />} />

      {/* 운영 지표 */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {overviewMetrics.map((m, i) => (
          <StatTile key={m.label} label={m.label} value={m.value} hint={m.hint} tone={TONE[i]} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 많이 들어온 질문 순위 */}
        <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <h3 className="text-sm font-semibold">많이 들어온 질문</h3>
          <p className="mb-3 mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            비슷한 질문끼리 자동으로 묶은 결과라 다른 질문이 섞여 있을 수 있습니다.
          </p>
          <ol className="space-y-2">
            {topQuestions.map((q, i) => (
              <li key={q.id} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-primary">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{q.question}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{q.count}건</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(q.count / maxTop) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <button className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            반복 질문을 안내자료로 만들기 <ChevronRight className="h-3 w-3" />
          </button>
        </section>

        <div className="space-y-4">
          {/* 상담 유입원 3분류 */}
          <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <h3 className="mb-3 text-sm font-semibold">상담 유입원</h3>
            <div className="space-y-2.5">
              {channelSources.map((c) => (
                <div key={c.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{c.label}</span>
                    <span className="tabular-nums text-muted-foreground">{c.count.toLocaleString()}건 · {c.share}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-sky-500/70" style={{ width: `${c.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 계약 부재 지표 — 0 대신 '현재 집계할 수 없음' */}
          <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">상담봇 세부 지표</h3>
            <p className="mt-1 text-sm text-muted-foreground">현재 집계할 수 없음</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">이 지표의 집계 연결이 아직 없어 0으로 채우지 않습니다.</p>
          </section>

          {/* CSV */}
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
            <span className="text-xs text-muted-foreground">CSV에는 환자 기준 5건 미만 셀을 가립니다.</span>
            <button className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">CSV 내려받기</button>
          </div>
        </div>
      </div>
    </StaffPage>
  )
}
