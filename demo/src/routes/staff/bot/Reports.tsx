import { useState } from 'react'
import { Sparkles, FlagIcon, BarChart3, AlertTriangle, X } from '@/components/icons'
import { StaffPage, PageHead, Segmented, EmptyState, btnPrimary, btnGhost } from '../_ui'
import { wrongAnswerReports, type WrongAnswerReport, type ReportStatus } from './mockData'

// 오답 신고 처리함 (/staff/bot/reports) — BADINBOX-REVIEW-*.
// 실시간 신고 + 품질 리뷰 교정을 한 처리함에, 출처(realtime_report/quality_review) 구분.
// [반영]→안내자료 수정(승인 거쳐야 반영) / [반려]. 신고 반영만으로 즉시 답변 안 씀.
// data-testid="bot-reports".

const STATUS_TONE: Record<ReportStatus, string> = {
  '처리 전': 'bg-amber-100 text-amber-800',
  '처리 중': 'bg-sky-100 text-sky-700',
  '처리 완료': 'bg-emerald-100 text-emerald-700',
}
const SOURCE_LABEL = { realtime_report: '실시간 신고', quality_review: '품질 리뷰' } as const

type Tab = '전체' | ReportStatus

export function Reports() {
  const [reports, setReports] = useState<WrongAnswerReport[]>(wrongAnswerReports)
  const [tab, setTab] = useState<Tab>('전체')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = reports.filter((r) => (tab === '전체' ? true : r.status === tab))
  const selected = reports.find((r) => r.id === selectedId) ?? null
  const setStatus = (id: string, status: ReportStatus) => setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))

  return (
    <StaffPage max="max-w-full" testid="bot-reports">
      <PageHead title="오답 신고 처리함" />

      <div className="mb-3">
        <Segmented
          options={(['전체', '처리 전', '처리 중', '처리 완료'] as Tab[]).map((k) => ({ key: k, label: k }))}
          value={tab}
          onChange={setTab}
          count={(k) => (k === '전체' ? reports.length : reports.filter((r) => r.status === k).length)}
        />
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {rows.length === 0 ? (
            <EmptyState title="처리할 오답 신고가 없습니다" />
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 ${r.id === selectedId ? 'bg-primary/5' : 'hover:bg-muted'}`}
              >
                <span className="mt-0.5 shrink-0">
                  {r.source === 'realtime_report' ? <FlagIcon className="h-4 w-4 text-rose-500" /> : <BarChart3 className="h-4 w-4 text-indigo-500" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.question}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{SOURCE_LABEL[r.source]}</span>
                    <span>·</span>
                    <span className="tabular-nums">{r.reportedAt}</span>
                  </div>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status]}`}>{r.status}</span>
              </button>
            ))
          )}
        </div>

        {selected && (
          <ReportDetail
            r={selected}
            onClose={() => setSelectedId(null)}
            onReflect={() => setStatus(selected.id, '처리 중')}
            onReject={() => setStatus(selected.id, '처리 완료')}
          />
        )}
      </div>
    </StaffPage>
  )
}

function ReportDetail({ r, onClose, onReflect, onReject }: { r: WrongAnswerReport; onClose: () => void; onReflect: () => void; onReject: () => void }) {
  const [example, setExample] = useState(false)
  return (
    <aside className="w-96 shrink-0 self-start rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{SOURCE_LABEL[r.source]}</span>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>

      <Field label="환자 질문">{r.question}</Field>
      <Field label="AI 상담봇 답변">
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{r.answer}</p>
      </Field>
      <Field label="올바른 안내">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{r.correction}</p>
      </Field>
      <Field label="답변 근거 자료"><span className="text-sm text-muted-foreground">{r.evidence}</span></Field>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} />
        향후 유사 질문 예시로도 사용
      </label>

      {r.status === '처리 완료' ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">처리 완료된 신고입니다.</p>
      ) : (
        <>
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
            반영을 눌러도 안내자료 수정·승인을 거쳐야 상담봇에 반영됩니다.
          </div>
          <div className="mt-3 flex gap-2">
            <button className={`${btnGhost} flex-1 justify-center`} onClick={onReject}>반려</button>
            <button className={`${btnPrimary} flex-1 justify-center`} onClick={onReflect}>
              <Sparkles className="h-4 w-4" /> 반영
            </button>
          </div>
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
