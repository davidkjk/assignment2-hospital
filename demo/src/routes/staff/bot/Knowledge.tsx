import { useState } from 'react'
import { LockKeyhole, History, ShieldCheck, AlertTriangle, ChevronRight } from '@/components/icons'
import { StaffPage, PageHead, btnPrimary, btnGhost, btnLink } from '../_ui'
import { knowledgeItems, knowledgeHistory, type KnowledgeItem, type KnowledgeStatus } from './mockData'

// 병원 안내자료 (/staff/bot/knowledge) — KBADM-LIST-* · KBADM-EDITOR-* · KBADM-HISTORY-*.
// 목록(제목·분류·상태·수정일, 승인·제한 구분) + 편집기 + 수정이력.
// 저장만으로 공개 안 됨(승인 전 비공개). 승인은 되돌릴 수 없음 확인창. 승인 성공 전 기존본 유지.
// data-testid="bot-knowledge".

const STATUS_TONE: Record<KnowledgeStatus, string> = {
  공개: 'bg-emerald-100 text-emerald-700',
  '검토 중': 'bg-amber-100 text-amber-800',
  임시저장: 'bg-slate-100 text-slate-600',
}
const CATEGORIES = ['위치·주차', '예약·변경·취소 규칙', '검사 전 준비사항', '자주 묻는 질문'] as const

export function Knowledge() {
  const [items, setItems] = useState<KnowledgeItem[]>(knowledgeItems)
  const [filter, setFilter] = useState<KnowledgeStatus | '전체'>('전체')
  const [selectedId, setSelectedId] = useState<string>(knowledgeItems[0].id)
  const [showHistory, setShowHistory] = useState(false)

  const rows = items.filter((k) => (filter === '전체' ? true : k.status === filter))
  const selected = items.find((k) => k.id === selectedId)!

  return (
    <StaffPage max="max-w-full" testid="bot-knowledge" footer={false}>
      <PageHead
        title="병원 안내자료"
        sub="상담봇이 답할 때 근거로 쓰는 자료입니다 · 승인해야 답변에 반영됩니다"
        action={<button className={btnPrimary}>새 안내자료</button>}
      />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
        {/* 왼쪽 목록 */}
        <div className="flex w-96 shrink-0 flex-col">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(['전체', '공개', '검토 중', '임시저장'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
            {rows.map((k) => (
              <button
                key={k.id}
                onClick={() => { setSelectedId(k.id); setShowHistory(false) }}
                className={`w-full rounded-lg border px-3 py-2.5 text-left ${k.id === selectedId ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:bg-muted'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{k.title}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[k.status]}`}>{k.status}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{k.category}</span>
                  {k.status === '공개' && <span className="inline-flex items-center gap-0.5 text-emerald-600"><ShieldCheck className="h-3 w-3" /> 승인됨</span>}
                  {k.restricted && <span className="inline-flex items-center gap-0.5 text-rose-600"><LockKeyhole className="h-3 w-3" /> 답변 안 함</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{k.updatedAt}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 오른쪽: 편집기 또는 수정이력 */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {showHistory ? (
            <HistoryView item={selected} onBack={() => setShowHistory(false)} />
          ) : (
            <Editor
              key={selected.id}
              item={selected}
              onHistory={() => setShowHistory(true)}
              onApprove={() => setItems((prev) => prev.map((x) => (x.id === selected.id ? { ...x, status: '공개' } : x)))}
            />
          )}
        </div>
      </div>
    </StaffPage>
  )
}

function Editor({ item, onHistory, onApprove }: { item: KnowledgeItem; onHistory: () => void; onApprove: () => void }) {
  const [title, setTitle] = useState(item.title)
  const [body, setBody] = useState(item.body)
  const [restricted, setRestricted] = useState(!!item.restricted)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [approved, setApproved] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold">안내자료 편집</h3>
        <button className={`${btnLink} inline-flex items-center gap-1`} onClick={onHistory}>
          <History className="h-3.5 w-3.5" /> 수정이력 보기
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {item.status !== '공개' && (
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

        <Field label="제목"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></Field>
        <Field label="분류">
          <select defaultValue={item.category} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="본문"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={inputCls} /></Field>

        <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-sm">
          <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="mt-0.5" />
          <span>
            상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다
            <span className="mt-0.5 block text-[11px] text-muted-foreground">의료 판단 등 봇이 지어내면 안 되는 주제에 씁니다.</span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/70 px-4 py-3">
        <button className={btnGhost}>임시저장</button>
        <button className={btnPrimary} onClick={() => setConfirmApprove(true)}>승인</button>
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
              <button className={btnPrimary} onClick={() => { onApprove(); setApproved(true); setConfirmApprove(false) }}>승인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryView({ item, onBack }: { item: KnowledgeItem; onBack: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold">{item.title} · 수정이력</h3>
        <button className={btnLink} onClick={onBack}>편집으로</button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {knowledgeHistory.map((h) => (
          <div key={h.id} className="rounded-xl border border-border/70">
            <button className="flex w-full items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">{h.version}</span>
                  <span className="text-xs text-muted-foreground">{h.change}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{h.by} · {h.at}</div>
              </div>
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openId === h.id ? 'rotate-90' : ''}`} />
            </button>
            {openId === h.id && (
              <div className="border-t border-border/60 px-3 py-2.5">
                <p className="mb-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">{h.body}</p>
                <button className={btnGhost}>이 내용으로 편집</button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">되돌리기가 아니라, 이 내용을 채워 다시 승인합니다.</p>
              </div>
            )}
          </div>
        ))}
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
