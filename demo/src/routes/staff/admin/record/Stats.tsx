// data-testid: staff-stats
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { BarChart3, CalendarDays, ExternalLink, FileText, X } from '@/components/icons'

import { maskBirth, maskPhone } from '../../mockData'
import { PageHead, Panel, Segmented, StaffPage, StatTile, StatusBadge, Toolbar, btnGhost, btnLink, btnPrimary } from '../../_ui'
import {
  buildStatsCsv,
  departmentBreakdown,
  doctorBreakdown,
  sourceBreakdown,
  statsMetrics,
  statsPatients,
  statusBreakdown,
  type StatsBreakdown,
} from './mockData'

type GroupBy = 'department' | 'doctor'

function Bars({ rows }: { rows: StatsBreakdown[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span className="font-semibold tabular-nums">{row.value}건 · {row.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${row.percent}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Stats() {
  const navigate = useNavigate()
  const [from, setFrom] = useState('2026-08-01')
  const [to, setTo] = useState('2026-08-22')
  const [appliedRange, setAppliedRange] = useState({ from, to })
  const [groupBy, setGroupBy] = useState<GroupBy>('department')
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const rangeError = from > to
  const selectedLabel = useMemo(
    () => statsMetrics.find((metric) => metric.key === selectedMetric)?.label,
    [selectedMetric],
  )

  const downloadCsv = () => {
    const blob = new Blob([buildStatsCsv(appliedRange.from, appliedRange.to)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `운영통계_${appliedRange.from}_${appliedRange.to}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <StaffPage testid="staff-stats">
      <PageHead
        title="운영 통계"
        sub="선택한 기간의 병원 운영 흐름을 집계합니다"
        action={
          <button className={btnGhost} onClick={downloadCsv}>
            <FileText className="h-4 w-4" />
            CSV 내려받기
          </button>
        }
      />

      <Panel className="mb-4">
        <Toolbar
          left={
            <>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <label className="text-xs font-medium text-muted-foreground" htmlFor="stats-from">시작일</label>
              <input id="stats-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
              <span className="text-muted-foreground">~</span>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="stats-to">종료일</label>
              <input id="stats-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
              <button className={btnPrimary} disabled={!from || !to || rangeError} onClick={() => setAppliedRange({ from, to })}>통계 보기</button>
            </>
          }
          right={<span className="text-xs text-muted-foreground">집계 표·필터 변경은 별도 감사 사건을 만들지 않습니다</span>}
        />
        {rangeError && <p className="text-xs font-medium text-primary">종료일은 시작일 이후로 선택해주세요</p>}
      </Panel>

      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{appliedRange.from} ~ {appliedRange.to} 운영 지표</h3>
        <span className="text-xs text-muted-foreground">숫자를 누르면 마스킹된 상세 명단이 열립니다</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statsMetrics.map((metric) => (
          <button key={metric.key} className="text-left disabled:cursor-default" disabled={!metric.drillable} onClick={() => setSelectedMetric(metric.key)}>
            <StatTile label={metric.label} value={metric.value} tone={metric.tone} hint={`${metric.basis}${metric.drillable ? ' · 상세 목록' : ''}`} />
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="예약 유입원" action={<TagLike text="생성일 기준" />}>
          <Bars rows={sourceBreakdown} />
          <p className="mt-3 text-xs text-muted-foreground">앱·직원·상담봇을 서로 섞지 않고 별도 유입원으로 집계합니다.</p>
        </Panel>
        <Panel title="예약 상태 분포" action={<TagLike text="상태 전이일 기준" />}>
          <Bars rows={statusBreakdown} />
        </Panel>
        <Panel
          title="예약 현황"
          action={<Segmented<GroupBy> options={[{ key: 'department', label: '진료과별' }, { key: 'doctor', label: '의사별' }]} value={groupBy} onChange={setGroupBy} />}
        >
          <Bars rows={groupBy === 'department' ? departmentBreakdown : doctorBreakdown} />
        </Panel>
        <Panel title="상담봇 지표">
          <div className="grid grid-cols-3 gap-3 text-center">
            <MiniMetric label="문의" value="74건" />
            <MiniMetric label="자체 안내" value="48건" />
            <MiniMetric label="직원 연결" value="26건" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">많이 들어온 질문 · 진료시간, 예약 변경, 주차 안내</p>
        </Panel>
      </div>

      <Panel className="mt-4" title={<span className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />CSV 소수 집계 보호</span>}>
        <p className="text-sm text-muted-foreground">
          화면의 관리자 집계는 숫자를 그대로 표시합니다. 병원 밖으로 나가는 CSV는 k=5 미만과 역산 가능한 셀을 <strong className="text-foreground">소수 인원 보호로 비공개</strong>로 억제합니다. 다운로드는 별도 감사 사건으로 남습니다.
        </p>
      </Panel>

      {selectedMetric && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-label={`${selectedLabel} 상세 목록`}>
          <Panel className="w-full max-w-3xl" pad="p-0">
            <div className="flex items-start justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="font-semibold">{selectedLabel} 상세 목록</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{appliedRange.from} ~ {appliedRange.to} · 최근 {statsPatients.length}건 · 마스킹된 명단</p>
              </div>
              <button className={btnGhost} aria-label="닫기" onClick={() => setSelectedMetric(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="divide-y divide-border/60">
              {statsPatients.map((patient) => (
                <button key={patient.id} onClick={() => navigate(`/staff/patients/${patient.id}`)} className="grid w-full grid-cols-[1fr_1.2fr_1fr_auto] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted">
                  <div><div className="font-semibold">{patient.name[0]}*{patient.name.at(-1)}</div><div className="text-xs text-muted-foreground">{maskBirth(patient.birth)}</div></div>
                  <span className="text-muted-foreground">{maskPhone(patient.phone)}</span>
                  <div><StatusBadge status={patient.status} /><div className="mt-1 text-xs text-muted-foreground">{patient.occurredAt}</div></div>
                  <span className={`${btnLink} inline-flex items-center gap-1`}>환자 상세 <ExternalLink className="h-3 w-3" /></span>
                </button>
              ))}
            </div>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">행을 열면 내부 환자 ID로 상세 화면에 이동하며, 상세 열람 기록이 남습니다.</p>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}

function TagLike({ text }: { text: string }) {
  return <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{text}</span>
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted p-3"><div className="text-lg font-bold tabular-nums">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>
}
