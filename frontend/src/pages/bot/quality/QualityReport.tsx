import { useEffect, useState } from 'react'
import { Check, ChevronRight, FlagIcon, X } from '../../../components/icons'
import { EmptyState, Tag, btnGhost, btnPrimary } from '../../../components/staff-ui'
import type { DateRange, QualityApi, QualitySession, QualitySessionDetail, ReviewStatus } from '../../../api/qualityAdmin'
import { formatKst } from '../knowledge/format'

// 상담 품질 리포트(QUALITY-REPORT-*) — 기간의 상담을 미검토 우선·최신순 20건(02, SD-08), 개인정보 없이 일시/질문요약/경로/근거/신고/검토상태.
// 상세는 왼쪽 목록을 유지한 우측 패널(04, R2-3 예외). 신고가 없던 답변에도 교정을 남기되(05) 교정만으로 즉시 반영하지 않는다 —
// source=quality_review로 오답 처리함에 등록되고 [반영/반려] 검토를 거친다(08, B3). 원문 없이 교정하지 않는다(12).
// 시각 뼈대 = 데모 bot/Quality.tsx(4열 목록 + 우측 상세). 지표 타일은 계약이 없어 만들지 않는다(BOTSTAT=Task 22).

const PAGE_SIZE = 20
const REVIEW_LABEL: Record<ReviewStatus, string> = { unreviewed: '미검토', ok: '문제없음', corrected: '교정됨' }

type ListPhase = 'loading' | 'ready' | 'empty' | 'error'

export interface QualityReportProps {
  api: QualityApi
  range: DateRange
  selectedId?: string | null
  /** 교정 저장 뒤 [처리함으로 가기 ›]. */
  onGoToInbox?: () => void
}

export function QualityReport({ api, range, selectedId = null, onGoToInbox }: QualityReportProps) {
  const [phase, setPhase] = useState<ListPhase>('loading')
  const [items, setItems] = useState<QualitySession[]>([])
  const [reportedOnly, setReportedOnly] = useState(false)
  const [selId, setSelId] = useState<string | null>(selectedId)

  const load = () => {
    setPhase('loading') // 기간·선택 맥락은 유지(10)
    api
      .listQualitySessions(range, 1)
      .then((r) => {
        // 미검토 우선 → 최신순(SD-08). 서버 정렬을 믿되 화면에서도 같은 규칙으로 안정화한다.
        const sorted = [...r.items].sort((a, b) => {
          const ua = a.reviewStatus === 'unreviewed' ? 0 : 1
          const ub = b.reviewStatus === 'unreviewed' ? 0 : 1
          return ua !== ub ? ua - ub : b.at.localeCompare(a.at)
        })
        setItems(sorted.slice(0, PAGE_SIZE))
        setPhase(sorted.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => setPhase('error')) // 0건·근거 없음으로 위장하지 않는다(11)
  }
  useEffect(load, [api, range.from, range.to])
  useEffect(() => setSelId(selectedId), [selectedId])

  const rows = reportedOnly ? items.filter((s) => s.reported) : items

  return (
    <div data-testid="quality-range" data-from={range.from} data-to={range.to} className="flex items-start gap-3">
      <div data-testid="quality-list" className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-2">
          <span data-testid="quality-page-size" data-size={PAGE_SIZE} className="text-xs text-muted-foreground">미검토 우선 · 최신순 · 최대 {PAGE_SIZE}건</span>
          <button
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reportedOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
            onClick={() => setReportedOnly((v) => !v)}
            aria-pressed={reportedOnly}
          >
            오답 신고만
          </button>
        </div>
        <div className="grid grid-cols-[96px_1fr_56px_72px] items-center gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
          <span>일시</span><span>질문 요약</span><span>경로</span><span>상태</span>
        </div>

        {phase === 'loading' && (
          <div aria-label="품질 목록 로딩" className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> 상담을 불러오는 중…
          </div>
        )}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm font-medium">상담을 불러오지 못했습니다</p>
            <button className={btnGhost} onClick={load}>다시 시도</button>
          </div>
        )}
        {phase === 'empty' && <EmptyState title="검토할 상담이 없습니다" hint="선택한 기간에 상담봇 상담이 없습니다." />}
        {phase === 'ready' && rows.length === 0 && <EmptyState title="오답 신고가 있는 상담이 없습니다" />}
        {phase === 'ready' &&
          rows.map((c) => (
            <button
              key={c.id}
              data-testid="quality-row"
              data-id={c.id}
              onClick={() => setSelId(c.id)}
              className={`grid w-full grid-cols-[96px_1fr_56px_72px] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-b-0 ${c.id === selId ? 'bg-primary/5' : 'hover:bg-muted'}`}
            >
              <span className="text-xs tabular-nums text-muted-foreground">{formatKst(c.at)}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.questionSummary || '(질문 없음)'}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                  {c.hasKbSource ? <span className="text-emerald-600">근거 있음</span> : <span className="text-muted-foreground">근거 없음</span>}
                  {c.reported && <span className="inline-flex items-center gap-0.5 text-rose-600"><FlagIcon className="h-3 w-3" /> 신고</span>}
                </span>
              </span>
              <span><Tag>{c.channel === 'app' ? '앱' : '웹'}</Tag></span>
              <span className={`text-xs ${c.reviewStatus === 'unreviewed' ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>{REVIEW_LABEL[c.reviewStatus]}</span>
            </button>
          ))}
      </div>

      {selId && (
        <SessionDetail key={selId} api={api} id={selId} onClose={() => setSelId(null)} onChanged={load} onGoToInbox={onGoToInbox} />
      )}
    </div>
  )
}

function SessionDetail({
  api, id, onClose, onChanged, onGoToInbox,
}: {
  api: QualityApi
  id: string
  onClose: () => void
  onChanged: () => void
  onGoToInbox?: () => void
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detail, setDetail] = useState<QualitySessionDetail | null>(null)
  const [correction, setCorrection] = useState('')
  const [save, setSave] = useState<'idle' | 'saving' | 'failed' | 'done'>('idle')
  const [ok, setOk] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  const load = () => {
    setPhase('loading')
    api
      .getQualitySession(id)
      .then((d) => {
        setDetail(d)
        setPhase('ready')
      })
      .catch(() => setPhase('error')) // 정상 부재로 위장하지 않는다(12)
  }
  useEffect(load, [api, id])

  const submit = () => {
    if (save === 'saving') return
    setSave('saving') // 중복 저장 차단·입력 유지(06)
    api
      .saveQualityCorrection(id, correction)
      .then(() => {
        setSave('done')
        onChanged()
      })
      .catch(() => setSave('failed')) // 입력 보존·재시도(07)
  }
  const markOk = () => {
    setOk('busy')
    api
      .markQualityOk(id)
      .then(() => {
        setOk('done')
        onChanged()
      })
      .catch(() => setOk('failed'))
  }

  return (
    <aside data-testid="quality-detail-panel" data-fullscreen="false" className="w-96 shrink-0 self-start rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">상담 원문</span>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>

      {phase === 'loading' && <p className="text-sm text-muted-foreground">원문을 불러오는 중…</p>}
      {phase === 'error' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">원문을 불러오지 못했습니다</p>
          <button className={`${btnGhost} self-start`} onClick={load}>다시 시도</button>
        </div>
      )}

      {phase === 'ready' && detail && (
        <>
          <Field label="환자 질문">{detail.question || '(질문 없음)'}</Field>
          <Field label="AI 상담봇 답변"><p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{detail.answer || '(답변 없음)'}</p></Field>
          <Field label="답변에 사용한 안내"><span className="text-sm text-muted-foreground">{detail.kbSource ?? '없음'}</span></Field>

          {save === 'done' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800"><Check className="h-4 w-4" /> 교정을 저장했습니다.</p>
              <p className="mt-0.5 text-xs text-emerald-700">오답 신고 처리함에서 [반영/반려] 검토를 거쳐야 상담봇에 반영됩니다.</p>
              {onGoToInbox && (
                <button className="mt-2 flex items-center gap-1 text-sm font-medium text-primary hover:underline" onClick={onGoToInbox}>
                  처리함으로 가기 <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">올바른 안내 (교정)</span>
                <textarea
                  aria-label="올바른 안내"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  rows={4}
                  disabled={save === 'saving'}
                  placeholder="이 답변을 어떻게 고쳐야 하는지 적습니다 — 신고가 없던 답변도 교정할 수 있습니다"
                  className={inputCls}
                />
              </label>
              {save === 'failed' && (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">저장하지 못했습니다. 입력한 교정은 그대로 있습니다.</p>
              )}
              <button className={`${btnPrimary} mt-2 w-full justify-center disabled:opacity-50`} disabled={save === 'saving' || !correction.trim()} onClick={submit}>
                {save === 'saving' ? '저장 중…' : save === 'failed' ? '다시 시도' : '교정 저장'}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">교정 저장만으로 승인 자료가 바뀌지 않습니다(처리함 검토 필요).</p>

              <div className="mt-3 border-t border-border/60 pt-3">
                {ok === 'done' ? (
                  <p className="text-xs text-emerald-700">문제없음으로 저장했습니다.</p>
                ) : (
                  <button className={`${btnGhost} w-full justify-center`} disabled={ok === 'busy'} onClick={markOk}>
                    {ok === 'busy' ? '저장 중…' : '문제없음으로 표시'}
                  </button>
                )}
                {ok === 'failed' && <p className="mt-1 text-xs text-rose-700">저장하지 못했습니다. 다시 눌러 주세요.</p>}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60'
