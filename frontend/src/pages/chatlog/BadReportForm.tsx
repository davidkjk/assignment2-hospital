import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from '../../components/icons'
import { btnGhost, btnPrimary } from '../../components/staff-ui'
import type { BadReportApi, TargetMessage } from '../../api/badReport'

// 직원 오답 신고 작성(BADRPT-FORM-*) — 상담봇 기록·티켓 상세의 봇 답변 「잘못된 답변 신고」로 들어오는 별도 전체 화면.
// 대상 봇 답변을 고정해 보이고(TARGET-01), 봇 답변이 아니면 저장 경로를 두지 않는다(TARGET-02).
// 저장은 answer_feedback(source=realtime_report)에 담길 뿐 상담봇에 즉시 반영되지 않는다(SOURCE-01·SAVE-03·B3).
// 저장 성공·취소 모두 왔던 화면의 직전 필터·스크롤로 돌아간다(SAVE-03·EXIT-01, 결정 B2).
// 시각 뼈대 = 데모 오답 처리함 상세(환자 질문/AI 답변/올바른 안내 필드) — 목업 107.

type LoadPhase = 'loading' | 'ready' | 'error'
type SavePhase = 'idle' | 'saving' | 'failed' | 'done'

export interface ReturnContext {
  scroll?: number
}

export interface BadReportFormProps {
  api: BadReportApi
  /** 신고 대상 봇 메시지 — 없으면 빈 신고를 만들지 않고 복귀 경로만 준다(EMPTY-01). */
  messageId: string | null
  onDone: (ctx: ReturnContext) => void
  onCancel: (ctx: ReturnContext) => void
  /** 왔던 화면의 스크롤 위치(복귀 시 그대로 돌려준다, B2). */
  returnScroll?: number
  /** 대상 대화의 라이브 갱신 신호 — 받아도 선택 메시지 ID를 바꾸지 않는다(LIVE-01, 삭제·수정 계약 확인 필요). */
  liveTick?: number
}

export function BadReportForm({ api, messageId, onDone, onCancel, returnScroll }: BadReportFormProps) {
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [target, setTarget] = useState<TargetMessage | null>(null)
  const [correction, setCorrection] = useState('')
  const [example, setExample] = useState(false)
  const [save, setSave] = useState<SavePhase>('idle')

  const ret: ReturnContext = { scroll: returnScroll }

  const load = () => {
    if (!messageId) return
    setPhase('loading')
    api
      .getTargetMessage(messageId)
      .then((t) => {
        setTarget(t)
        setPhase('ready')
      })
      .catch(() => setPhase('error')) // 성공처럼 진행하지 않는다(ERR-01)
  }

  // ⭐ messageId에만 반응 — liveTick(대화 갱신)에는 다시 불러오지 않아 선택 대상이 바뀌지 않는다(LIVE-01)
  useEffect(load, [api, messageId])

  const submit = () => {
    if (!messageId || save === 'saving' || save === 'done') return
    setSave('saving')
    api
      .reportBadAnswer({ messageId, correctionText: correction, addToExampleBank: example })
      .then(() => {
        setSave('done') // 같은 신고 중복 제출 차단(SAVE-03)
        onDone(ret)
      })
      .catch(() => setSave('failed')) // 작성값 보존 + 재시도(SAVE-02)
  }

  if (!messageId) {
    return (
      <Shell>
        <p className="text-sm font-medium">신고할 봇 답변이 없습니다</p>
        <p className="mt-1 text-xs text-muted-foreground">상담 기록에서 봇 답변의 [잘못된 답변 신고]로 들어와야 합니다.</p>
        <button className={`${btnGhost} mt-3`} onClick={() => onCancel(ret)}>상담 기록으로 돌아가기</button>
      </Shell>
    )
  }

  if (phase === 'loading') {
    return (
      <Shell>
        <div aria-label="대상 답변 로딩" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> 신고할 답변을 불러오는 중…
        </div>
      </Shell>
    )
  }

  if (phase === 'error' || !target) {
    return (
      <Shell>
        <p className="text-sm font-medium">대상 답변을 불러오지 못했습니다</p>
        <div className="mt-3 flex gap-2">
          <button className={btnGhost} onClick={() => onCancel(ret)}>돌아가기</button>
          <button className={btnPrimary} onClick={load}>다시 시도</button>
        </div>
      </Shell>
    )
  }

  if (target.role !== 'bot') {
    return (
      <Shell>
        <p className="text-sm font-medium">봇 답변만 신고할 수 있습니다</p>
        <p className="mt-1 text-xs text-muted-foreground">선택한 메시지는 상담봇 답변이 아닙니다.</p>
        <button className={`${btnGhost} mt-3`} onClick={() => onCancel(ret)}>돌아가기</button>
      </Shell>
    )
  }

  const busy = save === 'saving'
  const done = save === 'done'

  return (
    <Shell>
      <Field label="신고 대상 · AI 상담봇 답변">
        <p data-testid="bad-report-target" data-message-id={target.id} className="whitespace-pre-wrap rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {target.content}
        </p>
      </Field>

      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">올바른 안내 (교정)</span>
        <textarea
          aria-label="올바른 안내"
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          rows={5}
          disabled={busy || done}
          placeholder="이 답변을 어떻게 고쳐야 하는지 적습니다"
          className={inputCls}
        />
      </label>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} disabled={busy || done} />
        향후 유사 질문 예시로도 사용
      </label>

      {save === 'failed' && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span>저장하지 못했습니다. 작성한 내용은 그대로 있습니다.</span>
          <button className={btnGhost} onClick={submit}>다시 시도</button>
        </div>
      )}

      {done ? (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> 오답 신고 처리함에 저장했습니다.
          </p>
          <p className="mt-0.5 text-xs text-emerald-700">아직 상담봇에 반영된 것은 아닙니다 — 관리자가 처리함에서 반영/반려를 검토합니다.</p>
        </div>
      ) : (
        <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          저장하면 오답 신고 처리함에 들어갑니다. 상담봇 답변은 관리자가 안내자료 수정·승인을 거쳐야 바뀝니다.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button className={btnGhost} disabled={busy} onClick={() => onCancel(ret)}>취소</button>
        <button className={`${btnPrimary} disabled:opacity-50`} disabled={busy || done} onClick={submit}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60'
