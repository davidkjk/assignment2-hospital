import { useEffect, useState } from 'react'
import { AlertTriangle, BarChart3, FlagIcon, Sparkles, X } from '../../../components/icons'
import { EmptyState, Segmented, btnGhost, btnPrimary } from '../../../components/staff-ui'
import type { Feedback, FeedbackCounts, FeedbackSource, FeedbackStatus, QualityApi } from '../../../api/qualityAdmin'
import { formatKst } from '../knowledge/format'

// 오답 신고 처리함(BADINBOX-REVIEW-*) — 실시간 신고(realtime_report)와 품질 리뷰 교정(quality_review)을 한 처리함에 나란히(01).
// [반영]은 안내자료 수정·승인 흐름으로 이어지며 즉시 답변에 쓰지 않는다(03). [반려]는 자료·예시를 바꾸지 않는다(05).
// 처리 중 중복 차단(06)·실패는 미처리 유지(07)·완료는 결과 명확(08)·동시 처리(409)는 최신 상태로(09).
// 시각 뼈대 = 데모 bot/Reports.tsx(세그먼트 탭 + 목록 + 우측 상세 패널).

const SOURCE_LABEL: Record<FeedbackSource, string> = { realtime_report: '실시간 신고', quality_review: '품질 리뷰' }
const STATUS_LABEL: Record<FeedbackStatus, string> = { pending: '처리 전', applied: '적용 완료', rejected: '기각 완료' }
const STATUS_TONE: Record<FeedbackStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  applied: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-600',
}

type ListPhase = 'loading' | 'ready' | 'empty' | 'error'
type Action = 'apply' | 'reject'
type ActPhase = { k: 'idle' } | { k: 'busy'; action: Action } | { k: 'failed'; action: Action } | { k: 'conflict' } | { k: 'done'; action: Action }

export interface ApplyToKbTarget {
  feedbackId: string
  requiresApproval: true
  question: string
  correction: string | null
}

export interface BadAnswerInboxProps {
  api: QualityApi
  selectedId?: string | null
  /** [반영] — 안내자료 수정·승인 흐름 연결(즉시 반영 아님, 03). */
  onApplyToKb?: (t: ApplyToKbTarget) => void
  /** 반영 완료 뒤 안내자료 편집으로 이동(페이지가 onApplyToKb로 받은 대상을 연다). */
  onGoToKb?: () => void
  /** 예시 추가 여부는 신고에 담긴 값으로 서버가 판단한다(04) — 화면 표시용 힌트. */
  addToExample?: boolean
}

export function BadAnswerInbox({ api, selectedId = null, onApplyToKb, onGoToKb }: BadAnswerInboxProps) {
  const [status, setStatus] = useState<FeedbackStatus>('pending')
  const [phase, setPhase] = useState<ListPhase>('loading')
  const [rows, setRows] = useState<Feedback[]>([])
  const [selId, setSelId] = useState<string | null>(selectedId)
  const [counts, setCounts] = useState<FeedbackCounts | null>(null) // 탭 배지 — status별 건수(목록 3회 대신 counts 한 번)

  const load = () => {
    setPhase('loading')
    // 탭 배지: 건수는 어느 탭에서 보든 같으므로 목록과 함께 한 번씩 갱신한다. 실패해도 목록엔 영향 없다.
    api.getFeedbackCounts?.().then(setCounts).catch(() => {})
    api
      .listBadInbox(status)
      .then((r) => {
        setRows(r)
        setPhase(r.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => setPhase('error')) // 0건·근거 없음으로 바꾸지 않는다(12)
  }
  useEffect(load, [api, status])
  useEffect(() => setSelId(selectedId), [selectedId])

  return (
    <div className="space-y-3">
      <Segmented
        options={(['pending', 'applied', 'rejected'] as FeedbackStatus[]).map((k) => ({ key: k, label: STATUS_LABEL[k] }))}
        value={status}
        onChange={(k) => {
          setStatus(k)
          setSelId(null)
        }}
        count={counts ? (k) => counts[k] : undefined}
      />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {phase === 'loading' && (
            <div aria-label="처리함 로딩" className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> 오답 신고를 불러오는 중…
            </div>
          )}
          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-sm font-medium">오답 신고를 불러오지 못했습니다</p>
              <button className={btnGhost} onClick={load}>다시 시도</button>
            </div>
          )}
          {phase === 'empty' && <EmptyState title="처리할 오답 신고가 없습니다" />}
          {phase === 'ready' &&
            rows.map((r) => (
              <button
                key={r.id}
                data-testid="inbox-row"
                data-id={r.id}
                onClick={() => setSelId(r.id)}
                className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 ${r.id === selId ? 'bg-primary/5' : 'hover:bg-muted'}`}
              >
                <span className="mt-0.5 shrink-0">
                  {r.source === 'realtime_report' ? <FlagIcon className="h-4 w-4 text-rose-500" /> : <BarChart3 className="h-4 w-4 text-indigo-500" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.question || '(질문 없음)'}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{SOURCE_LABEL[r.source]}</span>
                    <span>·</span>
                    <span className="tabular-nums">{formatKst(r.createdAt)}</span>
                  </span>
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
              </button>
            ))}
        </div>

        {selId && (
          <FeedbackDetail
            key={selId}
            api={api}
            id={selId}
            onClose={() => setSelId(null)}
            onChanged={load}
            onApplyToKb={onApplyToKb}
            onGoToKb={onGoToKb}
          />
        )}
      </div>
    </div>
  )
}

function FeedbackDetail({
  api, id, onClose, onChanged, onApplyToKb, onGoToKb,
}: {
  api: QualityApi
  id: string
  onClose: () => void
  onChanged: () => void
  onApplyToKb?: (t: ApplyToKbTarget) => void
  onGoToKb?: () => void
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fb, setFb] = useState<Feedback | null>(null)
  const [act, setAct] = useState<ActPhase>({ k: 'idle' })
  // 「올바른 안내」 교정문 인라인 편집(BADINBOX-REVIEW) — pending 신고만. 저장은 반영과 별개로도 가능.
  const [correction, setCorrection] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState(false)

  const load = () => {
    setPhase('loading')
    api
      .getFeedback(id)
      .then((f) => {
        setFb(f)
        setCorrection(f.correction ?? '')
        setPhase('ready')
      })
      .catch(() => setPhase('error'))
  }
  useEffect(load, [api, id])

  const dirty = fb ? correction !== (fb.correction ?? '') : false

  // 409(다른 관리자가 먼저 처리) 공통 처리 — 성공으로 덮지 않고 최신 상태로 다시 불러온다(09).
  const onActError = (err: unknown, action: Action) => {
    const status = (err as { status?: number } | null)?.status
    if (status === 409) {
      setAct({ k: 'conflict' })
      load()
      onChanged()
    } else {
      setAct({ k: 'failed', action }) // 미처리 유지(07)
    }
  }

  // 교정문만 저장(반영 아님) — 반영 전에 문구를 다듬어 둔다. pending일 때만 서버가 허용(409는 처리됨).
  const saveCorrection = () => {
    if (!fb || saving || !dirty) return
    const text = correction.trim()
    setSaving(true)
    setSaved(false)
    setSaveErr(false)
    api
      .saveFeedbackCorrection(fb.id, text)
      .then(() => {
        setSaving(false)
        setSaved(true)
        setCorrection(text)
        setFb({ ...fb, correction: text || null })
      })
      .catch((err: unknown) => {
        setSaving(false)
        const status = (err as { status?: number } | null)?.status
        if (status === 409) {
          setAct({ k: 'conflict' })
          load()
          onChanged()
        } else {
          setSaveErr(true)
        }
      })
  }

  const run = (action: Action) => {
    if (!fb || act.k === 'busy') return
    if (action === 'reject') {
      setAct({ k: 'busy', action })
      api.rejectFeedback(fb.id).then(() => { setAct({ k: 'done', action }); onChanged() }).catch((e) => onActError(e, action))
      return
    }
    // 반영 = 안내자료 수정·승인 흐름으로 연결(즉시 답변에 쓰지 않는다, 03). 편집된 교정문을 함께 넘긴다.
    const text = correction.trim()
    onApplyToKb?.({ feedbackId: fb.id, requiresApproval: true, question: fb.question, correction: text || null })
    setAct({ k: 'busy', action })
    const doApply = () => api.applyFeedback(fb.id).then(() => { setAct({ k: 'done', action }); onChanged() }).catch((e) => onActError(e, action))
    // 편집된 교정문이 있으면 먼저 저장해 예시은행·KB 편집이 최신 문구를 쓰게 한다. 저장 실패면 반영 중단.
    if (text !== (fb.correction ?? '')) {
      api.saveFeedbackCorrection(fb.id, text).then(() => { setFb({ ...fb, correction: text || null }); doApply() }).catch((e) => onActError(e, action))
    } else {
      void doApply()
    }
  }

  const busy = act.k === 'busy'
  const editable = fb?.status === 'pending' && act.k !== 'done' && act.k !== 'conflict'

  return (
    <aside className="w-96 shrink-0 self-start rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{fb ? SOURCE_LABEL[fb.source] : '신고 상세'}</span>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기"><X className="h-4 w-4" /></button>
      </div>

      {phase === 'loading' && <p className="text-sm text-muted-foreground">신고를 불러오는 중…</p>}
      {phase === 'error' && (
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">신고를 불러오지 못했습니다</p>
          <button className={btnGhost} onClick={load}>다시 시도</button>
        </div>
      )}

      {phase === 'ready' && fb && (
        <>
          <Field label="환자 질문">{fb.question || '(질문 없음)'}</Field>
          <Field label="AI 상담봇 답변"><p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{fb.botAnswer || '(답변 본문 없음)'}</p></Field>
          <Field label="올바른 안내">
            {editable ? (
              <div className="space-y-1.5">
                <textarea
                  aria-label="올바른 안내 교정"
                  value={correction}
                  disabled={busy || saving}
                  rows={3}
                  placeholder="상담봇이 이렇게 답했어야 한다는 올바른 안내를 적습니다"
                  onChange={(e) => { setCorrection(e.target.value); setSaved(false); setSaveErr(false) }}
                  className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-emerald-900 outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <button className={btnGhost} disabled={saving || busy || !dirty} onClick={saveCorrection}>
                    {saving ? '저장 중…' : '교정문 저장'}
                  </button>
                  {saved && !dirty && <span className="text-xs text-emerald-700">저장됨</span>}
                  {saveErr && <span className="text-xs text-rose-600">저장하지 못했습니다. 다시 시도해 주세요.</span>}
                </div>
              </div>
            ) : fb.correction ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{fb.correction}</p>
            ) : (
              <span className="text-sm text-muted-foreground">교정 없음</span>
            )}
          </Field>
          {/* 없는 근거를 만들지 않는다(02) */}
          <Field label="답변 근거 자료"><span className="text-sm text-muted-foreground">{fb.hasSources ? '근거 자료 있음' : '근거 자료 없음'}</span></Field>

          {act.k === 'done' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              {act.action === 'apply' ? (
                <>
                  <p className="font-medium text-emerald-800">반영 처리했습니다.</p>
                  <p className="mt-0.5 text-xs text-emerald-700">안내자료 수정·승인을 거쳐야 상담봇 답변에 반영됩니다(승인 필요분).</p>
                  {onGoToKb && (
                    <button className={`${btnPrimary} mt-2 w-full justify-center`} onClick={onGoToKb}>
                      <Sparkles className="h-4 w-4" /> 안내자료 편집으로 가기
                    </button>
                  )}
                </>
              ) : (
                <p className="font-medium text-emerald-800">반려 처리했습니다. 승인 자료·참고 예시는 바뀌지 않았습니다.</p>
              )}
            </div>
          )}
          {act.k === 'conflict' && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">이미 다른 관리자가 처리했습니다. 최신 상태로 다시 불러왔습니다.</p>
          )}
          {act.k === 'failed' && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              처리하지 못했습니다. 신고는 미처리로 남아 있습니다.
              <button className={btnGhost} onClick={() => run(act.action)}>다시 시도</button>
            </div>
          )}

          {fb.status === 'pending' && act.k !== 'done' && act.k !== 'conflict' && (
            <>
              <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                반영을 눌러도 안내자료 수정·승인을 거쳐야 상담봇에 반영됩니다.
              </div>
              <div className="mt-3 flex gap-2">
                <button className={`${btnGhost} flex-1 justify-center`} disabled={busy} onClick={() => run('reject')}>반려</button>
                <button className={`${btnPrimary} flex-1 justify-center`} disabled={busy} onClick={() => run('apply')}>
                  <Sparkles className="h-4 w-4" /> {busy && act.action === 'apply' ? '반영 중…' : '반영'}
                </button>
              </div>
            </>
          )}
          {fb.status !== 'pending' && act.k === 'idle' && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">{STATUS_LABEL[fb.status]} 신고입니다.</p>
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
