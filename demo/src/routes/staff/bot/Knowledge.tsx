import { useState } from 'react'
import { LockKeyhole, History, ShieldCheck, AlertTriangle, ChevronDown, FileText } from '@/components/icons'
import { StaffPage, EmptyState, btnPrimary, btnGhost } from '../_ui'
import { knowledgeItems, knowledgeHistory, type KnowledgeItem, type KnowledgeStatus } from './mockData'

// 병원 안내자료 (/staff/bot/knowledge) — KBADM-LIST-* · KBADM-EDITOR-* · KBADM-HISTORY-*.
// 상단 칩 + 새 안내자료 / 왼쪽 목록 카드(헤더바=건수) / 오른쪽 편집기·수정이력(헤더바 정렬).
// 승인은 편집기에서 바로 → 상태는 승인됨/임시저장 둘뿐. 저장만으론 공개 안 됨.
// data-testid="bot-knowledge".

const STATUS_TONE: Record<KnowledgeStatus, string> = {
  '승인됨': 'bg-emerald-100 text-emerald-700',
  임시저장: 'bg-slate-100 text-slate-600',
}
const CATEGORIES = ['위치·주차', '예약·변경·취소 규칙', '검사 전 준비사항', '자주 묻는 질문'] as const
const BLANK: Omit<KnowledgeItem, 'id'> = { title: '', category: '자주 묻는 질문', status: '임시저장', updatedAt: '방금', body: '' }

type View = { k: 'empty' } | { k: 'edit'; id: string } | { k: 'new' } | { k: 'history'; id: string }

export function Knowledge() {
  const [items, setItems] = useState<KnowledgeItem[]>(knowledgeItems)
  const [filter, setFilter] = useState<KnowledgeStatus | '전체'>('전체')
  const [view, setView] = useState<View>({ k: 'empty' }) // 진입 시 아무것도 안 열려 있다
  const [reloadKey, setReloadKey] = useState(0)

  const rows = items.filter((k) => (filter === '전체' ? true : k.status === filter))
  const selId = view.k === 'edit' || view.k === 'history' ? view.id : null
  const selected = items.find((k) => k.id === selId) ?? null

  // 새 자료를 임시저장하면 그때 목록에 들어간다(누르자마자 빈 줄이 생기지 않게)
  const createDraft = (draft: Omit<KnowledgeItem, 'id'>) => {
    const id = `kb-new-${Date.now()}`
    setItems((prev) => [{ ...draft, id }, ...prev])
    setFilter('전체')
    setView({ k: 'edit', id })
  }
  const approve = (id: string) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: '승인됨' } : x)))
  // 이전 버전 불러오기(KBADM-HISTORY-05): 그 내용을 편집기에 채운다 — 되돌리기·자동 복원이 아니다
  const loadVersion = (id: string, body: string) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, body, status: '임시저장' } : x)))
    setReloadKey((k) => k + 1)
    setView({ k: 'edit', id })
  }

  return (
    <StaffPage max="max-w-full" testid="bot-knowledge" footer={false}>
      {/* 상단 줄: 칩(위로) + 새 안내자료 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['전체', '승인됨', '임시저장'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <button className={btnPrimary} onClick={() => setView({ k: 'new' })}>
          <FileText className="h-4 w-4" /> 새 안내자료
        </button>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 12rem)' }}>
        {/* 왼쪽 목록 카드 — 헤더바가 오른쪽 편집기 헤더바와 높이가 같아 상단 줄이 맞는다 */}
        <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <h3 className="text-sm font-semibold">안내자료</h3>
            <span className="text-xs text-muted-foreground tabular-nums">{rows.length}건</span>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
            {rows.length === 0 ? (
              <EmptyState title="조건에 맞는 안내자료가 없습니다" hint="필터를 바꿔 보세요." />
            ) : (
              rows.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setView({ k: 'edit', id: k.id })}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left ${k.id === selId ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:bg-muted'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{k.title || '(제목 없음)'}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[k.status]}`}>{k.status}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{k.category}</span>
                    {k.restricted && <span className="inline-flex items-center gap-0.5 text-rose-600"><LockKeyhole className="h-3 w-3" /> 답변 안 함</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{k.updatedAt}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 오른쪽: 편집기 / 수정이력 / 빈 상태 */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {view.k === 'empty' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">왼쪽에서 자료를 고르거나 [새 안내자료]로 시작하세요</p>
            </div>
          )}
          {view.k === 'history' && selected && (
            <HistoryView item={selected} onBack={() => setView({ k: 'edit', id: selected.id })} onLoadVersion={(body) => loadVersion(selected.id, body)} />
          )}
          {(view.k === 'edit' || view.k === 'new') && (
            <Editor
              key={view.k === 'edit' ? `${view.id}-${reloadKey}` : 'new'}
              item={view.k === 'edit' ? selected ?? { ...BLANK, id: '' } : { ...BLANK, id: '' }}
              isNew={view.k === 'new'}
              onHistory={() => view.k === 'edit' && setView({ k: 'history', id: view.id })}
              onApprove={() => view.k === 'edit' && approve(view.id)}
              onCreateDraft={createDraft}
            />
          )}
        </div>
      </div>
    </StaffPage>
  )
}

function Editor({
  item, isNew, onHistory, onApprove, onCreateDraft,
}: {
  item: KnowledgeItem
  isNew: boolean
  onHistory: () => void
  onApprove: () => void
  onCreateDraft: (d: Omit<KnowledgeItem, 'id'>) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [category, setCategory] = useState(item.category)
  const [body, setBody] = useState(item.body)
  const [restricted, setRestricted] = useState(!!item.restricted)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [approved, setApproved] = useState(false)
  const isApproved = item.status === '승인됨' && !isNew

  const draft = (): Omit<KnowledgeItem, 'id'> => ({ title, category, status: '임시저장', updatedAt: '방금', body, restricted })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold">{isNew ? '새 안내자료' : '안내자료 편집'}</h3>
        {!isNew && (
          <button className={`${btnGhost} px-2.5 py-1`} onClick={onHistory}>
            <History className="h-3.5 w-3.5" /> 수정이력 보기
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!isApproved && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            아직 승인 전이라 상담봇 답변에 쓰이지 않습니다. 저장만으로는 공개되지 않습니다.
          </div>
        )}
        {approved && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> 승인되어 AI 상담봇 답변에 반영되었습니다.
          </div>
        )}

        <Field label="제목"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="안내자료 제목" className={inputCls} /></Field>
        <Field label="분류">
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="본문"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="상담봇이 근거로 삼을 병원 안내 내용을 적습니다" className={inputCls} /></Field>

        <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="mt-0.5" />
          <span>
            상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다
            <span className="mt-0.5 block text-[11px] text-muted-foreground">의료 판단 등 봇이 지어내면 안 되는 주제에 씁니다.</span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
        {isNew ? (
          <button className={`${btnGhost} disabled:opacity-40`} disabled={!title.trim()} onClick={() => onCreateDraft(draft())}>임시저장</button>
        ) : (
          <button className={btnGhost}>임시저장</button>
        )}
        <button className={`${btnPrimary} disabled:opacity-40`} disabled={!title.trim() || !body.trim()} onClick={() => setConfirmApprove(true)}>승인</button>
      </div>

      {confirmApprove && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-bold">승인해 반영할까요?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              승인하면 곧바로 AI 상담봇 답변에 반영되고, 승인은 되돌릴 수 없습니다. 내용을 잘못 넣었다면 수정이력에서 이전 버전을 편집해 다시 승인하세요.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirmApprove(false)}>취소</button>
              <button className={btnPrimary} onClick={() => { if (isNew) onCreateDraft({ ...draft(), status: '승인됨' }); else onApprove(); setApproved(true); setConfirmApprove(false) }}>승인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryView({ item, onBack, onLoadVersion }: { item: KnowledgeItem; onBack: () => void; onLoadVersion: (body: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold">{item.title || '(제목 없음)'} · 수정이력</h3>
        <button className={`${btnGhost} px-2.5 py-1`} onClick={onBack}>편집으로</button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {knowledgeHistory.map((h) => {
          const open = openId === h.id
          return (
            <div key={h.id} className="rounded-xl border border-border/70">
              <button className="flex w-full items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpenId(open ? null : h.id)}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{h.version}</span>
                    <span className="text-xs text-muted-foreground">{h.change}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{h.by} · {h.at}</div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="border-t border-border/60 px-3 py-2.5">
                  <p className="mb-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">{h.body}</p>
                  <button className={btnGhost} onClick={() => onLoadVersion(h.body)}>이 버전 불러오기</button>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">이 내용을 편집기에 채웁니다. 확인·수정 후 <b>다시 승인</b>해야 반영됩니다(되돌리기·자동 복원이 아닙니다).</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
