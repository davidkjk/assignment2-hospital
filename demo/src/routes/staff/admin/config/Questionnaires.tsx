import { useState } from 'react'
import { ChevronDown, X, Check } from '@/components/icons'
import { StaffPage, PageHead, EmptyState, btnPrimary, btnGhost, btnLink } from '../../_ui'
import {
  qnaDepartments,
  qnaQuestions,
  qnaVersions,
  type QnaQuestion,
  type QuestionType,
  type QuestionAudience,
  type QnaVersion,
} from './mockData'

// 문진표 관리 (/staff/admin/questionnaires) — QADM-*.
// 왼쪽 진료과 목록 + 가운데 편집기 + 오른쪽 읽기 전용 버전 기록.
// 저장하면 덮어쓰지 않고 새 불변 버전을 만들어 현재로(결정12). 과거 버전은 읽기 전용 보존.
// data-testid="staff-questionnaires".

const TYPES: QuestionType[] = ['단답형', '장문형', '예/아니오']
const AUDIENCES: QuestionAudience[] = ['모든 환자', '여성 환자만', '남성 환자만']

export function Questionnaires() {
  const [deptId, setDeptId] = useState<string | null>('dep1')
  const dept = qnaDepartments.find((d) => d.id === deptId) ?? null

  return (
    <StaffPage max="max-w-full" testid="staff-questionnaires" footer={false}>
      <PageHead title="문진표 관리" sub="진료과별 사전문진 문항을 만들고 고칩니다 · 저장하면 새 버전으로 남습니다" />

      <div className="flex gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
        {/* 왼쪽: 진료과 목록 */}
        <nav className="w-52 shrink-0 space-y-1 overflow-y-auto">
          {qnaDepartments.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeptId(d.id)}
              className={`w-full rounded-lg px-3 py-2 text-left ${d.id === deptId ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              <div className="text-sm font-medium">{d.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {d.currentVersion ? `현재 사용 v${d.currentVersion}` : '문진표 없음'}
              </div>
            </button>
          ))}
        </nav>

        {/* 가운데 + 오른쪽 */}
        {dept ? (
          <Editor key={dept.id} deptId={dept.id} deptName={dept.name} />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-border/70 bg-card">
            <EmptyState title="진료과를 선택하세요" hint="진료과를 고르면 문진표를 만들고 고칠 수 있습니다." />
          </div>
        )}
      </div>
    </StaffPage>
  )
}

function Editor({ deptId, deptName }: { deptId: string; deptName: string }) {
  const [questions, setQuestions] = useState<QnaQuestion[]>(qnaQuestions[deptId] ?? [])
  const [dirty, setDirty] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [preview, setPreview] = useState<QnaVersion | null>(null)
  const versions = qnaVersions[deptId] ?? []
  const currentVersion = versions.find((v) => v.current)?.versionNo ?? null

  const update = (id: string, up: Partial<QnaQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...up } : q)))
    setDirty(true)
  }
  const move = (i: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setDirty(true)
  }
  const remove = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
    setDirty(true)
  }
  const add = () => {
    setQuestions((prev) => [...prev, { id: `new${Date.now()}`, text: '', type: '단답형', required: false, audience: '모든 환자' }])
    setDirty(true)
  }

  return (
    <>
      {/* 가운데: 편집기 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              {deptName} 문진표 {currentVersion && <span className="ml-1 rounded bg-primary/12 px-1.5 py-0.5 text-[11px] font-medium text-primary">현재 사용 v{currentVersion}</span>}
            </h3>
            <p className="text-[11px] text-muted-foreground">저장하면 새 버전으로 남습니다 · 과거 버전은 그대로 보존됩니다</p>
          </div>
          {dirty && <span className="text-xs text-amber-700">저장되지 않은 변경</span>}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {questions.length === 0 ? (
            <EmptyState title="아직 문진표가 없습니다" hint="0문항으로 저장하면 이 진료과는 문진을 받지 않습니다." />
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-border/70 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <input
                      value={q.text}
                      onChange={(e) => update(q.id, { text: e.target.value })}
                      placeholder="질문을 입력하세요"
                      className="w-full rounded-lg border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <select value={q.type} onChange={(e) => update(q.id, { type: e.target.value as QuestionType })} className={selCls}>
                        {TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <select value={q.audience} onChange={(e) => update(q.id, { audience: e.target.value as QuestionAudience })} className={selCls}>
                        {AUDIENCES.map((a) => <option key={a}>{a}</option>)}
                      </select>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={q.required} onChange={(e) => update(q.id, { required: e.target.checked })} />
                        병원이 꼭 확인
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로"><ChevronDown className="h-3.5 w-3.5 rotate-180" /></button>
                    <button className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === questions.length - 1} onClick={() => move(i, 1)} aria-label="아래로"><ChevronDown className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 text-rose-500 hover:bg-rose-50" onClick={() => remove(q.id)} aria-label="삭제"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
          <button className={`${btnGhost} w-full justify-center`} onClick={add}>문항 추가</button>
        </div>

        <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
          <span className="text-xs text-muted-foreground">문항 {questions.length}개 · 최대 30개</span>
          <button className={`${btnPrimary} disabled:opacity-50`} disabled={!dirty} onClick={() => setConfirmSave(true)}>새 버전으로 저장</button>
        </div>
      </div>

      {/* 오른쪽: 버전 기록 */}
      <aside className="w-64 shrink-0 overflow-y-auto rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <h3 className="mb-2 text-sm font-semibold">버전 기록</h3>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 저장된 버전이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {versions.map((v) => (
              <li key={v.versionNo}>
                <button
                  onClick={() => !v.current && setPreview(v)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${v.current ? 'border-primary/40 bg-primary/5' : 'border-border/70 hover:bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium tabular-nums">v{v.versionNo}</span>
                    {v.current && <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">현재 사용</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{v.savedAt}</div>
                  <div className="text-[11px] text-muted-foreground">{v.savedBy} · 문항 {v.questionCount}개</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {confirmSave && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-bold">새 버전으로 저장할까요?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              v{currentVersion} → v{(currentVersion ?? 0) + 1}로 저장됩니다. 지금 문진 중인 환자는 그대로 두고, 다음 재진입부터 새 버전을 씁니다. 과거 답변은 그대로 보존됩니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setConfirmSave(false)}>취소</button>
              <button className={btnPrimary} onClick={() => { setDirty(false); setConfirmSave(false) }}>새 버전으로 저장</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold">v{preview.versionNo} 미리보기 <span className="ml-1 text-xs font-normal text-muted-foreground">읽기 전용</span></h3>
              <button onClick={() => setPreview(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground tabular-nums">{preview.savedAt} · {preview.savedBy} · 문항 {preview.questionCount}개</p>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              과거 버전은 수정·삭제할 수 없습니다. 되돌리려면 이 버전을 복사해 새 버전으로 저장하세요.
            </p>
            <div className="mt-3 flex justify-end">
              <button className={btnLink} onClick={() => setPreview(null)}><Check className="mr-1 inline h-3.5 w-3.5" />확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const selCls = 'rounded-md border border-input bg-card px-2 py-1 text-xs outline-none focus:border-ring'
