import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, FileText, X } from '@/components/icons'
import { PageHead, Panel, StaffPage, StatusBadge, Tag, btnGhost, btnLink, btnPrimary } from '../../_ui'
import { initialQuestions, questionnaireDepartments, questionnaireVersions, type QuestionnaireQuestion } from './mockData'

// 문진표 관리 (/admin/questionnaires) — QADM-* · data-testid="staff-questionnaires".
export function Questionnaires() {
  const [department, setDepartment] = useState('internal')
  const [questions, setQuestions] = useState(initialQuestions)
  const [dirty, setDirty] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<number | null>(null)
  const selectedDepartment = questionnaireDepartments.find((item) => item.id === department) ?? questionnaireDepartments[0]

  const updateQuestion = (id: string, patch: Partial<QuestionnaireQuestion>) => {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question))
    setDirty(true)
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= questions.length) return
    setQuestions((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setDirty(true)
  }

  const addQuestion = () => {
    setQuestions((current) => [...current, { id: `q-new-${current.length + 1}`, text: '새 문항을 입력해 주세요.', type: '단답형', requiredReview: false, audience: '모든 환자' }])
    setDirty(true)
  }

  const publish = () => {
    setPublishing(false)
    setDirty(false)
    setPublished(true)
  }

  return (
    <StaffPage testid="staff-questionnaires" max="max-w-[1480px]">
      <PageHead
        title="문진표 관리"
        sub="발행된 양식은 고치지 않고 보존하며, 수정은 새 버전으로 남깁니다"
        action={<div className="flex items-center gap-2">{dirty && <span className="text-xs font-medium text-primary">● 저장되지 않은 변경</span>}<button disabled={!dirty} onClick={() => setPublishing(true)} className={btnPrimary}><FileText className="h-4 w-4" />새 버전 만들기</button></div>}
      />
      {published && <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />v4로 발행했습니다. 과거 버전과 과거 답변은 그대로 보존됩니다.</div>}

      <div className="grid gap-4 xl:grid-cols-[235px_minmax(500px,1fr)_286px]">
        <Panel title="진료과" pad="p-2">
          <nav className="space-y-1" aria-label="진료과 선택">
            {questionnaireDepartments.map((item) => (
              <button key={item.id} onClick={() => { setDepartment(item.id); setPreviewVersion(null) }} className={`w-full rounded-lg px-3 py-2.5 text-left ${department === item.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{item.name}</span><ChevronRight className="h-4 w-4" /></span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.version ? `현재 v${item.version} · ${item.questions}문항` : '문진표 없음'}</span>
              </button>
            ))}
          </nav>
        </Panel>

        {selectedDepartment.version === 0 ? (
          <Panel title={`${selectedDepartment.name} 문진표`}><div className="py-16 text-center"><ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">아직 문진표가 없습니다</p><p className="mt-1 text-sm text-muted-foreground">0문항으로 두면 이 진료과는 문진을 받지 않습니다.</p><button onClick={addQuestion} className={`${btnPrimary} mt-4`}>첫 문항 추가</button></div></Panel>
        ) : previewVersion ? (
          <ReadOnlyPreview department={selectedDepartment.name} version={previewVersion} onClose={() => setPreviewVersion(null)} />
        ) : (
          <Panel
            title={<span className="flex items-center gap-2">{selectedDepartment.name} 문진표 <StatusBadge status={`현재 사용 v${published ? 4 : selectedDepartment.version}`} tone="green" /></span>}
            action={<span className="text-xs text-muted-foreground">마지막 저장 2026-08-18 16:42 · 김민지</span>}
          >
            <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"><span>저장하면 기존 양식을 덮어쓰지 않고 새 불변 버전으로 발행됩니다.</span>{dirty && <button onClick={() => { setQuestions(initialQuestions); setDirty(false) }} className={btnLink}>변경 취소</button>}</div>
            <div className="space-y-2">
              {questions.map((question, index) => (
                <div key={question.id} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold">{index + 1}</span>
                    <Tag>{question.id}</Tag>
                    <div className="ml-auto flex gap-1">
                      <button disabled={index === 0} onClick={() => moveQuestion(index, -1)} className={`${btnGhost} !px-2 !py-1`} aria-label="위로"><ChevronDown className="h-3.5 w-3.5 rotate-180" /></button>
                      <button disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)} className={`${btnGhost} !px-2 !py-1`} aria-label="아래로"><ChevronDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { setQuestions((current) => current.filter((item) => item.id !== question.id)); setDirty(true) }} className={`${btnGhost} !px-2 !py-1`}>삭제</button>
                    </div>
                  </div>
                  <input value={question.text} onChange={(event) => updateQuestion(question.id, { text: event.target.value })} className={inputClass} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-[150px_1fr_1fr]">
                    <select value={question.type} onChange={(event) => updateQuestion(question.id, { type: event.target.value as QuestionnaireQuestion['type'] })} className={inputClass}><option>단답형</option><option>장문형</option><option>예/아니오</option></select>
                    <select value={question.audience} onChange={(event) => updateQuestion(question.id, { audience: event.target.value as QuestionnaireQuestion['audience'] })} className={inputClass}><option>모든 환자</option><option>여성 환자만</option><option>남성 환자만</option></select>
                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 text-sm"><input type="checkbox" checked={question.requiredReview} onChange={(event) => updateQuestion(question.id, { requiredReview: event.target.checked })} />병원이 꼭 확인</label>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addQuestion} disabled={questions.length >= 30} className={`${btnGhost} mt-3`}>문항 추가 · {questions.length}/30</button>
          </Panel>
        )}

        <Panel title="버전 기록" pad="p-2">
          <div className="space-y-1">
            {questionnaireVersions.map((version) => (
              <button key={version.version} onClick={() => setPreviewVersion(version.current ? null : version.version)} className={`w-full rounded-lg border p-3 text-left ${previewVersion === version.version ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                <span className="flex items-center gap-2"><strong>v{version.version}</strong>{version.current && <StatusBadge status="현재 사용" tone="green" />}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{version.savedAt}<br />{version.staff} · {version.questions}문항</span>
              </button>
            ))}
          </div>
          <p className="mt-3 px-1 text-xs text-muted-foreground">발행된 버전은 수정·삭제·숨김할 수 없습니다. 과거 버전을 바탕으로 고치려면 내용을 복사해 새 버전으로 발행합니다.</p>
        </Panel>
      </div>

      {publishing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3"><div><h3 id="publish-title" className="font-bold">새 v4를 발행할까요?</h3><p className="mt-1 text-sm text-muted-foreground">현재 v3는 읽기 전용으로 보존되고, 새 v4가 즉시 환자의 현재 문진표가 됩니다.</p></div><button onClick={() => setPublishing(false)} aria-label="닫기"><X className="h-5 w-5 text-muted-foreground" /></button></div>
            <div className="mt-4 rounded-lg bg-muted p-3 text-sm"><strong>v3 → v4</strong><span className="ml-2 text-muted-foreground">{questions.length}문항 · 과거 답변 보존</span></div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setPublishing(false)} className={btnGhost}>더 고치기</button><button onClick={publish} className={btnPrimary}>v4 발행 확정</button></div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}

function ReadOnlyPreview({ department, version, onClose }: { department: string; version: number; onClose: () => void }) {
  return <Panel title={<span className="flex items-center gap-2">{department} 문진표 <StatusBadge status={`v${version} 읽기 전용`} tone="soft" /></span>} action={<button onClick={onClose} className={btnGhost}>현재 버전으로</button>}><div className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">발행된 과거 버전입니다. 수정·삭제·숨김할 수 없습니다.</div><div className="divide-y divide-border/60 rounded-lg border border-border">{initialQuestions.slice(0, version + 1).map((question, index) => <div key={question.id} className="p-3"><div className="flex items-center gap-2"><strong>{index + 1}. {question.text}</strong><Tag>{question.type}</Tag></div><p className="mt-1 text-xs text-muted-foreground">{question.audience}{question.requiredReview ? ' · 병원이 꼭 확인' : ''}</p></div>)}</div></Panel>
}

const inputClass = 'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40'
