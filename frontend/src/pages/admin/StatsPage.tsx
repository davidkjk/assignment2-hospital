import { useMemo, useState, type CSSProperties } from 'react'
import { hospitalHHMM } from '../../lib/clock'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ApiError } from '../../api/httpClient'
import { getStats, getStatsBy, logStatsExport, type StatsResponse } from '../../api/stats'
import { PeriodPicker, presetRange } from './PeriodPicker'
import { MetricCards, type DrillTarget } from './MetricCards'
import { SourceMixCard } from './SourceMixCard'
import { ByDimensionTable } from './ByDimensionTable'
import { HourlyVisitTable } from './HourlyVisitTable'
import { BotMetricCard } from './BotMetricCard'
import { DrilldownModal } from './DrilldownModal'
import { buildStatsCsv } from './exportCsv'

// [STAT-*] 운영 통계 /admin/stats — 관리자 전용 읽기 집계(셸·권한은 RequireRole/AppShell이 지킨다).
//
// ⭐ 화면은 소수 억제를 하지 않는다(결정21) — 1건짜리 값도 그대로 보이고 모든 셀을 누를 수 있다.
//    k=5 억제는 병원 밖으로 나가는 CSV 파일에만 건다(exportCsv). 이 페이지는 suppressForExport를
//    화면 렌더 경로에서 절대 부르지 않는다 — CSV 다운로드 확인 뒤에만 부른다(STAT-MASK-01).
// ⭐ 집계 표·필터 변경은 감사하지 않는다(결정22). 드릴다운은 서버가, CSV는 여기서 감사를 남긴다.

interface StatsPageProps {
  /** 초기 기간(기본: 최근 7일). 테스트가 기간을 고정할 때 쓴다. */
  initialPeriod?: { from: string; to: string }
}

type ByDim = 'department' | 'doctor'

export function StatsPage({ initialPeriod }: StatsPageProps) {
  const initial = initialPeriod ?? presetRange('7d')
  const [draft, setDraft] = useState(initial)
  const [applied, setApplied] = useState(initial)
  const [rangeError, setRangeError] = useState<string>()
  const [by, setBy] = useState<ByDim>('department')
  const [drill, setDrill] = useState<DrillTarget>()
  const [csvOpen, setCsvOpen] = useState(false)
  const [exportNote, setExportNote] = useState<string>()

  const statsQuery = useQuery({
    queryKey: ['stats', applied.from, applied.to],
    queryFn: () => getStats(applied.from, applied.to),
    placeholderData: keepPreviousData,
  })
  const byQuery = useQuery({
    queryKey: ['stats-by', applied.from, applied.to, by],
    queryFn: () => getStatsBy(applied.from, applied.to, by),
    placeholderData: keepPreviousData,
  })

  function onApply() {
    // [STAT-SCOPE-01] 한쪽이라도 비면 조회하지 않는다. [STAT-SCOPE-02] 역순이면 고칠 수 있게 둔다.
    if (!draft.from || !draft.to) {
      setRangeError('시작일과 종료일을 모두 선택해주세요')
      return
    }
    if (draft.from > draft.to) {
      setRangeError('종료일은 시작일 이후로 선택해주세요')
      return
    }
    setRangeError(undefined)
    setApplied({ from: draft.from, to: draft.to })
  }

  const busy = statsQuery.isFetching && statsQuery.isPlaceholderData
  const stats = statsQuery.data
  const isOffline = statsQuery.error instanceof ApiError && statsQuery.error.status === 0
  const isEmpty = useMemo(() => stats != null && isZero(stats), [stats])

  function downloadCsv() {
    const rows = (byQuery.data?.rows ?? []).map((r) => ({
      label: r.label,
      booked: r.booked,
      visited: r.visited,
      no_show: r.no_show,
    }))
    const result = buildStatsCsv({
      period: applied,
      byLabel: by === 'doctor' ? '의사' : '진료과',
      rows,
    })
    // [STAT-AUDIT-02] 파일은 여기서 만들되 감사는 서버에 남긴다. 실패해도 다운로드는 진행하되
    // 조용히 삼키지 않는다 — 기록이 빠졌다는 사실을 화면에 남긴다.
    logStatsExport({ metric: by, row_count: result.rowCount, suppressed: result.suppressed }).catch(() => {
      setExportNote('내보내기 기록을 남기지 못했습니다. 파일은 내려받았습니다.')
    })
    triggerDownload(result.content, `운영통계_${applied.from}_${applied.to}.csv`)
    setCsvOpen(false)
  }

  return (
    <section aria-label="운영 통계" style={styles.page}>
      <header style={styles.header}>
        <div />
        <button type="button" onClick={() => setCsvOpen(true)} disabled={!stats || isEmpty} style={styles.csvBtn}>
          CSV 다운로드
        </button>
      </header>

      <PeriodPicker
        from={draft.from}
        to={draft.to}
        onChange={setDraft}
        onApply={onApply}
        error={rangeError}
      />

      {exportNote && (
        <p role="alert" style={styles.exportNote}>
          {exportNote}
        </p>
      )}

      {/* 조회 실패(첫 로드) — 공통 오류·재시도 계약을 그대로 쓴다(STAT-STATE-03·04). */}
      {statsQuery.isError && !stats && (
        <EmptyState
          kind={isOffline ? 'offline' : 'error'}
          screen="운영 통계"
          onRetry={() => statsQuery.refetch()}
          action={
            <Link to="/today" style={styles.todayLink}>
              오늘의 현황으로 가기
            </Link>
          }
        />
      )}

      {/* 첫 로드 중 — 이전 결과가 없어 보여줄 것이 없다. */}
      {statsQuery.isPending && !stats && (
        <p role="status" style={styles.status}>
          통계를 불러오는 중입니다
        </p>
      )}

      {/* 갱신 중 실패로 이전 결과만 남았을 때 — 최신인 척하지 않는다(STAT-STATE-04). */}
      {statsQuery.isError && stats && (
        <div role="alert" style={styles.staleBanner}>
          연결이 원활하지 않아 마지막으로 불러온 시각({syncedLabel(statsQuery.dataUpdatedAt)}) 기준입니다.
          <button type="button" onClick={() => statsQuery.refetch()} style={styles.staleRetry}>
            다시 시도
          </button>
        </div>
      )}

      {stats && isEmpty && (
        <EmptyState kind="zero" message="선택한 기간에 집계할 사건이 없습니다" />
      )}

      {stats && !isEmpty && (
        <div
          className={statsQuery.isError ? 'is-stale' : undefined}
          data-testid="stats-body"
          data-stale={statsQuery.isError ? 'true' : undefined}
          style={styles.body}
        >
          <MetricCards stats={stats} period={applied} busy={busy} onDrill={setDrill} />

          <div style={styles.twoCol}>
            <SourceMixCard mix={stats.source_mix} />
            <BotMetricCard bot={stats.bot} />
          </div>

          {byQuery.data && (
            <ByDimensionTable data={byQuery.data} onToggle={setBy} onDrillCell={setDrill} />
          )}

          <HourlyVisitTable data={stats.visits_by_hour} />
        </div>
      )}

      {drill && (
        <DrilldownModal target={drill} period={applied} onClose={() => setDrill(undefined)} />
      )}

      {csvOpen && (
        <ConfirmDialog
          title="CSV로 내려받기"
          confirmLabel="내려받기"
          onConfirm={downloadCsv}
          onCancel={() => setCsvOpen(false)}
        >
          {/* [STAT-MASK-03] 다운로드 직전 화면 한 줄 안내 — 값이 화면과 다른 이유. */}
          <p style={styles.csvNote}>
            화면은 전부 보이지만, 병원 밖으로 나가는 <strong>파일에서는 5명 미만 칸이 가려집니다</strong>
            («소수 인원 보호로 비공개»). 전체 수치는 이 화면에서 확인하세요.
          </p>
          <p style={styles.csvAudit}>이 내려받기는 통계 CSV 내보내기 기록으로 남습니다.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

function isZero(s: StatsResponse): boolean {
  return s.source_mix.total === 0 && s.visits.value === 0 && s.cancelled.value === 0 && s.no_show.value === 0
}

function syncedLabel(ts: number): string {
  if (!ts) return '방금 전'
  const d = new Date(ts)
  return hospitalHHMM(d) // [TIME-TZ-01] 병원 시계로 적는다
}

function triggerDownload(content: string, filename: string) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1360, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  h1: { margin: 0, fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  lede: { margin: '2px 0 0', fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
  csvBtn: {
    height: 34,
    padding: '0 14px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  exportNote: { margin: 0, color: 'var(--color-warn)', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'] },
  status: { padding: 24, textAlign: 'center', color: 'var(--color-ink-muted)' },
  staleBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 8,
    background: 'var(--color-done-bg)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-body)',
  },
  staleRetry: {
    height: 28,
    padding: '0 12px',
    border: '1px solid var(--color-primary)',
    borderRadius: 7,
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'],
    cursor: 'pointer',
  },
  body: { display: 'flex', flexDirection: 'column', gap: 12 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
  todayLink: { color: 'var(--color-primary)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], textDecoration: 'none' },
  csvNote: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink)' },
  csvAudit: { margin: '8px 0 0', fontSize: 'var(--fs-caption)', color: 'var(--color-ink-muted)' },
}
