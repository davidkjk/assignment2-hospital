import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlagIcon, Check, X, ChevronRight } from '@/components/icons'
import { StaffPage, PageHead, StatTile, Tag, btnPrimary, btnGhost, PeriodSelect } from '../_ui'
import { qualityMetrics, qualityConversations, referenceExamples, type QualityConversation, type ReferenceExample } from './mockData'

// 상담 품질 리포트 (/staff/bot/quality) — QUALITY-REPORT-* · QAEX-LIST-*.
// 기간 지표 + 상담 목록(미검토 먼저·최신순) + 우측 상세 교정 입력.
// 교정 저장 → source=quality_review로 오답 처리함 등록(검토 거쳐야 반영). 참고 예시 비활성화.
// data-testid="bot-quality".

const TONE = ['teal', 'sky', 'green', 'amber'] as const

export function Quality() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [examples, setExamples] = useState<ReferenceExample[]>(referenceExamples)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // 미검토 먼저, 같은 상태에서 최신순
  const rows = [...qualityConversations].sort((a, b) => {
    if (a.reviewStatus !== b.reviewStatus) return a.reviewStatus === '미검토' ? -1 : 1
    return b.at.localeCompare(a.at)
  })
  const selected = qualityConversations.find((c) => c.id === selectedId) ?? null

  return (
    <StaffPage max="max-w-full" testid="bot-quality">
      <PageHead title="상담 품질 리포트" action={<PeriodSelect />} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {qualityMetrics.map((m, i) => (
          <StatTile key={m.label} label={m.label} value={m.value} hint={m.hint} tone={TONE[i]} />
        ))}
      </div>

      <div className="mb-6 flex gap-3">
        {/* 상담 목록 */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="grid grid-cols-[84px_1fr_56px_84px] items-center gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-[11px] font-medium text-muted-foreground">
            <span>일시</span><span>질문 요약</span><span>경로</span><span>상태</span>
          </div>
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`grid w-full grid-cols-[84px_1fr_56px_84px] items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left text-sm last:border-b-0 ${c.id === selectedId ? 'bg-primary/5' : 'hover:bg-muted'}`}
            >
              <span className="text-xs tabular-nums text-muted-foreground">{c.at}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.question}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                  {c.grounded ? <span className="text-emerald-600">안내 사용</span> : <span className="text-muted-foreground">안내 없음</span>}
                  {c.reported && <span className="inline-flex items-center gap-0.5 text-rose-600"><FlagIcon className="h-3 w-3" /> 신고</span>}
                </span>
              </span>
              <span><Tag>{c.channel}</Tag></span>
              <span className={`text-xs ${c.reviewStatus === '미검토' ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>{c.reviewStatus}</span>
            </button>
          ))}
        </div>

        {selected && <ConversationDetail c={selected} onClose={() => setSelectedId(null)} />}
      </div>

      {/* 참고 예시 관리 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">참고 예시</h3>
        <p className="mb-2 text-xs text-muted-foreground">「향후 유사 질문 예시로도 사용」으로 등록된 교정입니다. 비활성화하면 상담봇이 더 이상 참고하지 않습니다(삭제 아님).</p>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {examples.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">등록된 참고 예시가 없습니다.</p>
          ) : (
            examples.map((e) => (
              <div key={e.id} className="border-b border-border/60 px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className={`min-w-0 flex-1 ${e.active || editId === e.id ? '' : 'opacity-50'}`}>
                    <div className="text-sm font-medium">Q. {e.question}</div>
                    {editId === e.id ? (
                      <textarea
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                      />
                    ) : (
                      <div className="mt-0.5 text-sm text-muted-foreground">A. {e.correction}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {editId === e.id ? (
                      <>
                        <button className={`${btnGhost} px-2.5 py-1`} onClick={() => setEditId(null)}>취소</button>
                        <button className={`${btnPrimary} px-2.5 py-1`} onClick={() => { setExamples((prev) => prev.map((x) => (x.id === e.id ? { ...x, correction: draft } : x))); setEditId(null) }}>저장</button>
                      </>
                    ) : (
                      <>
                        <button className={`${btnGhost} px-2.5 py-1`} onClick={() => { setEditId(e.id); setDraft(e.correction) }}>편집</button>
                        {e.active ? (
                          <button className={`${btnGhost} px-2.5 py-1`} onClick={() => setExamples((prev) => prev.map((x) => (x.id === e.id ? { ...x, active: false } : x)))}>비활성화</button>
                        ) : (
                          <button className={`${btnGhost} px-2.5 py-1`} onClick={() => setExamples((prev) => prev.map((x) => (x.id === e.id ? { ...x, active: true } : x)))}>다시 활성화</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </StaffPage>
  )
}

function ConversationDetail({ c, onClose }: { c: QualityConversation; onClose: () => void }) {
  const navigate = useNavigate()
  const [correction, setCorrection] = useState('')
  const [saved, setSaved] = useState(false)

  return (
    <aside className="w-96 shrink-0 self-start rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Tag>{c.channel}</Tag><span className="text-xs tabular-nums text-muted-foreground">{c.at}</span></div>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>

      <Field label="환자 질문">{c.question}</Field>
      <Field label="AI 상담봇 답변"><p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{c.answer}</p></Field>
      <Field label="답변에 사용한 안내"><span className="text-sm text-muted-foreground">{c.evidence}</span></Field>

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800"><Check className="h-4 w-4" /> 교정을 저장했습니다.</p>
          <p className="mt-0.5 text-xs text-emerald-700">오답 신고 처리함에서 반영/반려 검토를 거쳐야 상담봇에 반영됩니다.</p>
          <button className="mt-2 flex items-center gap-1 text-sm font-medium text-primary hover:underline" onClick={() => navigate('/staff/bot/reports')}>
            처리함으로 가기 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">올바른 안내 (교정)</div>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={4}
            placeholder="이 답변을 어떻게 고쳐야 하는지 적습니다"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
          <button className={`${btnPrimary} mt-2 w-full justify-center disabled:opacity-50`} disabled={!correction.trim()} onClick={() => setSaved(true)}>
            교정 저장
          </button>
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
