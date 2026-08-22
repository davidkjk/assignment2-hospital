// data-testid: staff-errors
import { useMemo, useState } from 'react'

import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, FileText, ShieldCheck } from '@/components/icons'

import { EmptyState, PageHead, Panel, StaffPage, StatusBadge, Tag, Toolbar, btnPrimary } from '../../_ui'
import { systemErrors, type ErrorSeverity } from './mockData'

const severityTone: Record<ErrorSeverity, 'amber' | 'red' | 'gray'> = {
  주의: 'amber',
  오류: 'red',
  장애: 'gray',
}

export function Errors() {
  const [from, setFrom] = useState('2026-08-01')
  const [to, setTo] = useState('2026-08-22')
  const [severity, setSeverity] = useState<ErrorSeverity | '전체'>('전체')
  const [applied, setApplied] = useState({ from, to })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const rangeError = from > to

  const rows = useMemo(
    () => systemErrors.filter((error) => error.date >= applied.from && error.date <= applied.to && (severity === '전체' || error.severity === severity)),
    [applied, severity],
  )

  return (
    <StaffPage testid="staff-errors" max="max-w-7xl">
      <PageHead title="시스템 오류 기록" sub="오류가 발생한 시간과 기능을 확인합니다" />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">이 기록은 수정하거나 삭제할 수 없습니다</p><p className="mt-0.5 text-xs text-muted-foreground">행에서 재실행·삭제·해결 처리를 하지 않습니다. 개발자용 원문은 이 화면이 아닌 서버 로그에서 확인합니다.</p></div></div>
        </Panel>
        <Panel>
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">알림 실패 이중기록 경계</p><p className="mt-0.5 text-xs text-muted-foreground">수신자별 개별 실패는 발송 이력에만 남습니다. 서비스 전체 장애가 실제 적재된 경우에만 이 화면에 한 줄로 표시합니다.</p></div></div>
        </Panel>
      </div>

      <Panel className="mb-4">
        <Toolbar
          left={
            <>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="errors-from">시작일</label>
              <input id="errors-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
              <span className="text-muted-foreground">~</span>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="errors-to">종료일</label>
              <input id="errors-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
              <select aria-label="심각도 필터" value={severity} onChange={(event) => setSeverity(event.target.value as ErrorSeverity | '전체')} className="h-9 rounded-lg border border-input bg-card px-3 text-sm"><option>전체</option><option>주의</option><option>오류</option><option>장애</option></select>
              <button className={btnPrimary} disabled={rangeError || !from || !to} onClick={() => setApplied({ from, to })}>조회</button>
            </>
          }
          right={<span className="text-xs text-muted-foreground">최근 200건 · 병원 시간대 · 최신순</span>}
        />
        {rangeError && <p className="text-xs font-medium text-primary">종료일은 시작일 이후로 선택해주세요</p>}
      </Panel>

      <Panel pad="p-0">
        <div className="grid grid-cols-[11rem_9rem_7rem_1fr_2rem] gap-3 border-b border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
          <span>발생 시각</span><span>기능</span><span>유형</span><span>오류 내용</span><span />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<AlertCircle className="h-5 w-5" />} title="해당 기간에 오류 기록이 없습니다" hint="기간을 넓혀 다시 조회해보세요" />
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((error) => {
              const open = expandedId === error.id
              return (
                <div key={error.id}>
                  <button onClick={() => setExpandedId(open ? null : error.id)} className="grid w-full grid-cols-[11rem_9rem_7rem_1fr_2rem] items-start gap-3 px-4 py-3 text-left text-sm hover:bg-muted" aria-expanded={open}>
                    <span className="text-xs tabular-nums text-muted-foreground">{error.occurredAt}</span>
                    <span className="font-semibold">{error.feature}</span>
                    <div><StatusBadge status={error.severity} tone={severityTone[error.severity]} />{error.serviceWide && <Tag className="mt-1">서비스 전체 1건</Tag>}</div>
                    <span>{error.summary}</span>
                    {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {open && (
                    <div className="border-t border-border/60 bg-muted px-4 py-4 pl-[20rem]">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-border bg-card p-3"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><AlertCircle className="h-4 w-4" />안전 요약</div><p className="mt-2 text-sm">{error.summary}</p></div>
                        <div className="rounded-lg border border-border bg-card p-3"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><FileText className="h-4 w-4" />Redaction된 기술 상세</span><Tag>{error.correlationId}</Tag></div><code className="mt-2 block break-all text-xs leading-5 text-muted-foreground">{error.technicalDetail}</code></div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">비밀 열쇠·환자 이름·전화·생년월일·토큰은 [REDACTED] 처리했습니다. 기술적 원인과 상관 ID만 유지합니다.</p>
                      {error.serviceWide && <p className="mt-2 text-xs font-medium text-primary">이 행은 서비스 전체 장애 한 건입니다. 환자별 발송 실패 결과는 발송 이력에만 있습니다.</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </StaffPage>
  )
}
