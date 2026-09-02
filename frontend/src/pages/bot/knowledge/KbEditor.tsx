import { useEffect, useState } from 'react'
import { AlertTriangle, History } from '../../../components/icons'
import { btnGhost } from '../../../components/staff-ui'
import type { KbAdminApi, KbDetail } from '../../../api/kbAdmin'
import { KbApproveFlow } from './KbApproveFlow'
import { EXCLUDED_CATEGORIES, KB_CATEGORIES, RESTRICTED_LABEL } from './constants'

// 안내자료 편집(KBADM-EDITOR-01·02·03·05·06·07·08·15·16·17) — 작성·수정하되 저장만으로 공개하지 않는다.
// 저장(submitEdit)은 pending_*에 담고 라이브를 즉시 안 바꾼다. 승인은 KbApproveFlow가 확인창 안에서만 실행한다.
// ⭐ 분류에 의사 소개·진료시간을 넣지 않고, 기존 KB에 그런 자료가 남아 있으면 재승인을 막고 원본 관리로 안내한다.
// 시각: 데모 편집기(헤더바 「안내자료 편집 · 수정이력 보기」 / 푸터 한 줄 [저장][승인]).

type LoadPhase = 'loading' | 'ready' | 'error'

export interface KbEditorProps {
  api: KbAdminApi
  docId: string
  onGotoRevision?: (docId: string) => void
  /** 이력의 이전 버전 [편집]에서 넘어온 내용 — 라이브 대신 이 값을 새 수정본으로 채운다(A2·HISTORY-05). */
  prefill?: { title: string; content: string }
}

export function KbEditor({ api, docId, onGotoRevision = () => {}, prefill }: KbEditorProps) {
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [detail, setDetail] = useState<KbDetail | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [content, setContent] = useState('')
  const [restricted, setRestricted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [savedNote, setSavedNote] = useState(false)

  const load = () => {
    setPhase('loading')
    api
      .getDoc(docId)
      .then((d) => {
        setDetail(d)
        // 이력에서 넘어온 prefill이 있으면 그 내용을, 없으면 대기 수정본→라이브 순으로 채운다.
        setTitle(prefill?.title ?? d.pendingTitle ?? d.title)
        setCategory(d.category)
        setContent(prefill?.content ?? d.pendingContent ?? d.content)
        setRestricted(d.isRestricted)
        setPhase('ready')
      })
      .catch(() => setPhase('error')) // 로딩 오류를 새 자료 작성으로 전환하지 않는다(EDITOR-16)
  }

  useEffect(load, [api, docId])

  const header = (
    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
      <h3 className="text-sm font-semibold">안내자료 편집</h3>
      {phase === 'ready' && (
        <button className={`${btnGhost} px-2.5 py-1`} onClick={() => onGotoRevision(docId)}>
          <History className="h-3.5 w-3.5" /> 수정이력 보기
        </button>
      )}
    </div>
  )

  if (phase === 'loading') {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div aria-label="자료 로딩" className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
          자료를 불러오는 중…
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium">자료를 불러오지 못했습니다</p>
          <button className={btnGhost} onClick={load}>다시 시도</button>
        </div>
      </div>
    )
  }

  const excluded = EXCLUDED_CATEGORIES.includes(category as (typeof EXCLUDED_CATEGORIES)[number])
  const isApproved = detail?.status === 'approved'
  // 현재 분류가 표준 목록에 없어도(예: 옛 자료) 선택지에 얹어 값을 잃지 않는다.
  const categoryOptions = KB_CATEGORIES.includes(category as (typeof KB_CATEGORIES)[number])
    ? [...KB_CATEGORIES]
    : [category, ...KB_CATEGORIES]

  const save = () => {
    setSaving(true)
    setSaveError(false)
    setSavedNote(false)
    api
      .submitEdit(docId, { title, category, content, isRestricted: restricted })
      .then(() => {
        setSaving(false)
        setSavedNote(true) // 저장=pending(승인 전 비공개) — 라이브는 안 바뀜(EDITOR-06)
      })
      .catch(() => {
        setSaving(false)
        setSaveError(true) // 편집값을 보존하고 재시도를 표시(EDITOR-08)
      })
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {excluded && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            진료과·의사 소개와 진료시간·휴진일은 안내자료가 아니라 정본 원본으로 관리합니다(직원 관리·진료 일정). 여기서는 다시 승인할 수 없습니다.
          </div>
        )}
        {!isApproved && !excluded && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            아직 승인 전이라 상담봇 답변에 쓰이지 않습니다. 저장만으로는 공개되지 않고, 승인해야 답변에 반영됩니다.
          </div>
        )}
        {isApproved && detail?.hasPendingEdit && !prefill && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            승인 대기 중인 수정본을 편집하고 있습니다. 승인 전까지 상담봇은 기존 승인본으로 답합니다.
          </div>
        )}
        {savedNote && (
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            저장했습니다. 승인 전이라 아직 답변에 반영되지 않습니다.
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">제목</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="안내자료 제목" className={inputCls} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">분류</span>
          <select aria-label="분류" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">내용</span>
          <textarea
            aria-label="내용"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            placeholder="상담봇이 근거로 삼을 병원 안내 내용을 적습니다"
            className={inputCls}
          />
        </label>

        <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="mt-0.5" aria-label={RESTRICTED_LABEL} />
          <span>
            {RESTRICTED_LABEL}
            <span className="mt-0.5 block text-[11px] text-muted-foreground">의료 판단 등 봇이 지어내면 안 되는 주제에 씁니다.</span>
          </span>
        </label>

        {saveError && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            저장하지 못했습니다. 입력한 내용은 그대로 있습니다.
            <button className={btnGhost} onClick={save}>다시 시도</button>
          </div>
        )}
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <KbApproveFlow
          api={api}
          docId={docId}
          onGotoRevision={onGotoRevision}
          liveTitle={detail?.title}
          disabled={excluded}
          showHistoryButton={false}
          leading={
            <button className={`${btnGhost} disabled:opacity-40`} disabled={saving || excluded || !title.trim() || !content.trim()} onClick={save}>
              {saving ? '저장 중…' : '저장'}
            </button>
          }
        />
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
